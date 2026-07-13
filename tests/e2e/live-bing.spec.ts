import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const userscriptPath = path.resolve(__dirname, '../../dist/rewards-points-farmer.user.js');
const storageStatePath = path.resolve(__dirname, '../../playwright/.auth/bing.json');
const liveUrl = 'https://www.bing.com/search?q=playwright%20smoke';
const rewardsEntrySelector = '.points-container, #id_rc, #rewards-badge';
const rewardsFlyoutSelector = 'iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout, iframe.b_rwFlyout';

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
});

async function createLivePage(browser: Browser, options: { worker?: boolean } = {}) {
  const contextOptions: BrowserContextOptions = {
    locale: 'zh-CN',
    storageState: storageStatePath,
    timezoneId: 'Asia/Shanghai',
  };
  const context = await browser.newContext(contextOptions);
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
  await page.waitForFunction(selector => {
    return Array.from(document.querySelectorAll(selector)).some(el => {
      return el.id !== 'rh-badge' && el instanceof HTMLElement && el.offsetParent !== null;
    });
  }, rewardsEntrySelector);
}

async function clickNativeRewardsEntry(page: Page) {
  await waitForNativeRewardsEntry(page);
  await page.evaluate(selector => {
    const entry = Array.from(document.querySelectorAll(selector)).find(el => {
      return el.id !== 'rh-badge' && el instanceof HTMLElement && el.offsetParent !== null;
    }) as HTMLElement | undefined;

    if (!entry) {
      throw new Error('Native rewards entry was not found.');
    }

    entry.click();
  }, rewardsEntrySelector);
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
    !fs.existsSync(storageStatePath),
    'Run "npm run auth:bing" first to create playwright/.auth/bing.json.'
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
});
