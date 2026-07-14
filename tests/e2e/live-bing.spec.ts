import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const userscriptPath = path.resolve(__dirname, '../../dist/rewards-points-farmer.user.js');
const storageStatePath = path.resolve(__dirname, '../../playwright/.auth/bing.json');
const cookieHeader = process.env.PLAYWRIGHT_BING_COOKIE_HEADER?.trim() || '';
const liveUrl = 'https://www.bing.com/search?q=playwright%20smoke';
const rewardsEntrySelector = '.points-container, #id_rc, #rewards-badge';
const visibleRewardsEntrySelector = rewardsEntrySelector
  .split(',')
  .map(selector => `${selector.trim()}:not(#rh-badge):visible`)
  .join(', ');
const rewardsFlyoutSelector = 'iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout, iframe.b_rwFlyout';

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
});

async function createLivePage(browser: Browser, options: { worker?: boolean } = {}) {
  const contextOptions: BrowserContextOptions = {
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  };
  if (!cookieHeader) contextOptions.storageState = storageStatePath;
  const context = await browser.newContext(contextOptions);
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').flatMap(part => {
      const separator = part.indexOf('=');
      if (separator <= 0) return [];
      return [{
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        url: 'https://www.bing.com/',
      }];
    });
    await context.addCookies(cookies);
  }
  const page = await context.newPage();
  await page.addInitScript({ path: userscriptPath });
  const targetUrl = new URL(liveUrl);
  if (options.worker) targetUrl.searchParams.set('rewards_helper_worker', '1');
  await page.goto(targetUrl.toString(), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => typeof (window as any).startRewardsTask === 'function');
  return { context, page };
}

async function waitForNativeRewardsEntry(page: Page) {
  await page.locator(visibleRewardsEntrySelector).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function clickNativeRewardsEntry(page: Page) {
  await waitForNativeRewardsEntry(page);
  await page.locator(visibleRewardsEntrySelector).first().click({ timeout: 15_000 });
}

async function expectSearchNotStarted(page: Page) {
  await expect
    .poll(() => {
      return page.evaluate(() => {
        const raw = localStorage.getItem('bing_rewards_auto_searcher_state');
        if (!raw) return false;
        try {
          return Boolean(JSON.parse(raw).isSearching);
        } catch {
          return false;
        }
      });
    })
    .toBe(false);
}

test.describe('live Bing smoke @live', () => {
  test.skip(
    !cookieHeader && !fs.existsSync(storageStatePath),
    'Provide PLAYWRIGHT_BING_COOKIE_HEADER or run "npm run auth:bing" first.'
  );

  test('loads Bing with saved login state and injects the userscript UI', async ({ browser }) => {
    const { context, page } = await createLivePage(browser);

    await expect(page.locator('#rh-badge')).toBeVisible({ timeout: 15_000 });
    await page.locator('#rh-badge').click();
    await expect(page.locator('#rh-start-btn')).toBeVisible();
    await expectSearchNotStarted(page);

    await context.close();
  });

  test('finds the live Rewards entry without starting automation', async ({ browser }) => {
    const { context, page } = await createLivePage(browser);

    await waitForNativeRewardsEntry(page);
    await page.locator('#rh-badge').click();
    await expect(page.locator('#rh-dropdown')).toBeVisible();
    await page.mouse.click(20, 20);
    await expect(page.locator('#rh-dropdown')).toBeHidden();
    await expectSearchNotStarted(page);

    await context.close();
  });

  test('opens the live Rewards flyout and observes rendered content', async ({ browser }) => {
    const { context, page } = await createLivePage(browser);

    await clickNativeRewardsEntry(page);
    await expect(page.locator(rewardsFlyoutSelector).first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () => {
          return page
            .frameLocator(rewardsFlyoutSelector)
            .first()
            .locator('body')
            .innerText({ timeout: 1_000 })
            .catch(() => '');
        },
        { timeout: 15_000 }
      )
      .toMatch(/\S{10,}/);
    await expectSearchNotStarted(page);

    await context.close();
  });

  test('updates the script panel from dedicated-tab readonly Rewards parsing', async ({ browser }) => {
    const { context, page } = await createLivePage(browser, { worker: true });

    await page.waitForFunction(
      () => {
        const progress = document.querySelector('#rh-progress-text')?.textContent?.trim() || '';
        const tasks = document.querySelector('#rh-tasks-list')?.textContent?.trim() || '';
        const isInitialProgress = progress === '0 / 0';
        const isInitialTasks = /Fetching tasks|正在获取任务/.test(tasks);
        return Boolean(progress) && (!isInitialProgress || !isInitialTasks);
      },
      null,
      { timeout: 20_000 }
    );

    await page.locator('#rh-badge').click();
    await expect(page.locator('#rh-dropdown')).toBeVisible();
    await expect(page.locator('#rh-progress-text')).not.toHaveText('0 / 0');
    await expect(page.locator('#rh-tasks-list')).not.toContainText(/Fetching tasks|正在获取任务/);
    await expectSearchNotStarted(page);

    await context.close();
  });

  test('executes one live card follow-up search without using a URL @live-card', async ({ browser }) => {
    test.skip(process.env.PLAYWRIGHT_LIVE_CARD_E2E !== '1', 'Set PLAYWRIGHT_LIVE_CARD_E2E=1 to execute one live card task.');
    test.setTimeout(120_000);
    const { context, page } = await createLivePage(browser, { worker: true });

    try {
      let liveState: { phase: string; queue: Array<{ title: string; queryCandidates: string[] }> } | null = null;
      await expect
        .poll(async () => {
          const state = await page.evaluate(() => {
            if (typeof (window as any).__e2e_getExecutionPhase !== 'function') return null;
            const progress = document.querySelector('#rh-progress-text')?.textContent?.trim() || '';
            if (!progress || progress === '0 / 0') return null;
            return {
              phase: (window as any).__e2e_getExecutionPhase(),
              queue: (window as any).__e2e_getDailyTaskQueue(),
            };
          }).catch(() => null);
          if (state) liveState = state;
          return Boolean(state);
        }, { timeout: 30_000 })
        .toBe(true);

      if (!liveState || liveState.phase !== 'cards' || liveState.queue.length === 0) {
        test.skip(true, 'Live account has no executable card after search points are complete.');
      }

      const initialTask = liveState.queue[0];
      expect(initialTask.queryCandidates).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/(?:^[a-z][a-z0-9+.-]*:|^\/|bing\.com)/i)])
      );

      await page.evaluate(() => (window as any).startRewardsTask());
      await expect
        .poll(
          () => page.evaluate(() => {
            const raw = localStorage.getItem('bing_rewards_auto_searcher_state');
            const state = raw ? JSON.parse(raw) : null;
            const task = state?.dailyTasksQueue?.[0];
            if (!task || task.attempts < 2) return null;
            return {
              attempts: task.attempts,
              term: state.usedSearchTerms?.at(-1) || '',
            };
          }),
          { timeout: 90_000 }
        )
        .not.toBeNull();

      const result = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('bing_rewards_auto_searcher_state') || '{}');
        return {
          attempts: state.dailyTasksQueue?.[0]?.attempts || 0,
          term: state.usedSearchTerms?.at(-1) || '',
        };
      });
      expect(result.attempts).toBeGreaterThanOrEqual(2);
      expect(result.term).not.toMatch(/(?:^[a-z][a-z0-9+.-]*:|^\/|bing\.com)/i);
      expect(result.term.trim().length).toBeGreaterThan(1);
    } finally {
      if (!page.isClosed()) {
        await page.evaluate(() => (window as any).stopRewardsTask?.()).catch(() => undefined);
      }
      if (context.pages().length > 0) await context.close();
    }
  });
});
