import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fixtureUrl = pathToFileURL(path.resolve(__dirname, 'fixtures/bing-shell.html')).href;
const userscriptPath = path.resolve(__dirname, '../../dist/rewards-points-farmer.user.js');

type SavedState = {
  isSearching: boolean;
  currentProgress: {
    current: number;
    total: number;
    lastChecked: number;
    completed: boolean;
    noProgressCount: number;
  };
  usedSearchTerms?: string[];
  mainPageSearchTerms?: string[];
  iframeSearchTerms?: string[];
  dailyTasksQueue?: Array<string | {
    url: string;
    title: string;
    status: '未完成' | '已完成';
    points: number;
    queryCandidates: string[];
    attempts: number;
  }>;
  attemptedTasks?: string[];
};

async function loadUserscriptFixture(page: Page, savedState?: SavedState, options: { worker?: boolean } = {}) {
  if (savedState) {
    await page.context().addInitScript(state => {
      localStorage.setItem(
        'bing_rewards_auto_searcher_state',
        JSON.stringify({
          ...state,
          lastActivityTime: Date.now(),
          timestamp: Date.now(),
        })
      );
    }, savedState);
  }

  await page.context().addInitScript({ path: userscriptPath });
  const url = options.worker ? `${fixtureUrl}?rewards_helper_worker=1` : fixtureUrl;
  await page.goto(url);
  await page.waitForFunction(() => typeof (window as any).startRewardsTask === 'function');
}

test('shows the collapsed badge and opens the control panel from the badge', async ({ page }) => {
  await loadUserscriptFixture(page);

  await expect(page.locator('#rh-badge')).toBeVisible();
  await expect(page.locator('#rh-badge-text')).toHaveText(/Initializing|0\/0/);
  await expect(page.locator('#rh-dropdown')).toBeHidden();

  await page.locator('#rh-badge').click();
  await expect(page.locator('#rh-dropdown')).toBeVisible();
  await expect(page.locator('#rh-start-btn')).toContainText('Start Farming');
  await expect(page.locator('.rh-header')).toContainText('Rewards Points Farmer');
});

test('keeps the floating button fixed while the page scrolls', async ({ page }) => {
  await loadUserscriptFixture(page);

  const before = await page.locator('#rewards-helper-container').evaluate(element => ({
    position: getComputedStyle(element).position,
    rect: element.getBoundingClientRect().toJSON(),
  }));
  expect(before.position).toBe('fixed');

  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);

  const after = await page.locator('#rewards-helper-container').evaluate(element => element.getBoundingClientRect().toJSON());
  expect(after.x).toBeCloseTo(before.rect.x, 0);
  expect(after.y).toBeCloseTo(before.rect.y, 0);
});

test('opens settings and persists configuration across reloads', async ({ page }) => {
  await loadUserscriptFixture(page);

  await page.locator('#rh-badge').click();
  await page.locator('#rh-settings-toggle').click();
  await expect(page.locator('#rh-settings-view')).toBeVisible();
  await expect(page.locator('#rh-main-view')).toBeHidden();

  await page.locator('#rh-min-interval').fill('9');
  await page.locator('#rh-max-interval').fill('15');
  await page.locator('#rh-scroll-time').fill('18');
  await page.locator('#rh-rest-time').fill('7');
  await page.locator('#rh-max-no-progress').fill('5');
  await page.locator('#rh-save-settings').click();

  await expect(page.locator('#rh-settings-view')).toBeHidden();
  await expect(page.locator('#rh-toast')).toContainText('Settings saved');
  const savedConfig = await page.evaluate(() => JSON.parse(localStorage.getItem('bing_rewards_config') || '{}'));
  expect(savedConfig).toMatchObject({
    searchInterval: [9, 15],
    scrollTime: 18,
    restTime: 420,
    maxNoProgressCount: 5,
  });

  await page.reload();
  await page.waitForFunction(() => typeof (window as any).startRewardsTask === 'function');
  await page.locator('#rh-badge').click();
  await page.locator('#rh-settings-toggle').click();
  await expect(page.locator('#rh-min-interval')).toHaveValue('9');
  await expect(page.locator('#rh-max-interval')).toHaveValue('15');
  await expect(page.locator('#rh-scroll-time')).toHaveValue('18');
  await expect(page.locator('#rh-rest-time')).toHaveValue('7');
  await expect(page.locator('#rh-max-no-progress')).toHaveValue('5');
});

test('keeps the settings panel inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await loadUserscriptFixture(page);

  await page.locator('#rh-badge').click();
  await page.locator('#rh-settings-toggle').click();
  const panel = await page.locator('#rh-dropdown').boundingBox();

  expect(panel).not.toBeNull();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.y).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(360);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(640);
});

test('closes the control panel when clicking outside it', async ({ page }) => {
  await loadUserscriptFixture(page);

  await page.locator('#rh-badge').click();
  await expect(page.locator('#rh-dropdown')).toBeVisible();

  await page.locator('#content').click();
  await expect(page.locator('#rh-dropdown')).toBeHidden();
});

test('does not open the Rewards sidebar or execute in a regular Bing tab', async ({ page }) => {
  await loadUserscriptFixture(page);

  await page.waitForTimeout(2_500);
  await expect(page.locator('#b_rwFlyout')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__e2e_isDedicatedWorker())).toBe(false);
  expect(await page.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(false);
});

test('opens one dedicated task tab and accepts stop commands from the controller', async ({ page, context }) => {
  await loadUserscriptFixture(page);

  const workerPromise = context.waitForEvent('page');
  await page.locator('#rh-badge').click();
  await page.locator('#rh-start-btn').click();
  const worker = await workerPromise;
  await worker.waitForFunction(() => typeof (window as any).__e2e_isDedicatedWorker === 'function');

  expect(new URL(worker.url()).searchParams.get('rewards_helper_worker')).toBe('1');
  expect(await worker.evaluate(() => (window as any).__e2e_isDedicatedWorker())).toBe(true);
  expect(await page.evaluate(() => (window as any).__e2e_isDedicatedWorker())).toBe(false);
  expect(await page.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(false);
  expect(page.url()).toBe(fixtureUrl);

  await expect.poll(() => worker.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(true);
  await expect(page.locator('#rh-start-btn')).toContainText('Stop Farming');
  await expect(worker.locator('#rh-worker-mode')).toContainText('Dedicated task tab');

  await page.locator('#rh-badge').click();
  await page.locator('#rh-start-btn').click();
  await expect.poll(() => worker.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(false);
  await expect(page.locator('#rh-start-btn')).toContainText('Start Farming');

  await page.locator('#rh-badge').click();
  await page.locator('#rh-start-btn').click();
  await expect.poll(() => worker.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(true);
  expect(context.pages()).toHaveLength(2);
  await page.locator('#rh-badge').click();
  await page.locator('#rh-start-btn').click();
  await expect.poll(() => worker.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(false);

  await worker.goto(fixtureUrl);
  await worker.waitForFunction(() => typeof (window as any).__e2e_isDedicatedWorker === 'function');
  expect(await worker.evaluate(() => (window as any).__e2e_isDedicatedWorker())).toBe(true);
});

test('injects the userscript UI and parses the rewards flyout', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { worker: true });

  await expect(page.locator('#rh-badge')).toBeVisible();
  await expect(page.locator('#rh-progress-text')).toHaveText('0/90', { timeout: 6_000 });
  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)');
  await expect(page.locator('#rh-tasks-list')).toContainText('Daily poll');
  await expect(page.locator('#rh-tasks-list')).toContainText('NASA Artemis mission');
});

test('renders parsed task state in the dropdown task list', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { worker: true });

  await page.locator('#rh-badge').click();
  await expect(page.locator('#rh-dropdown')).toBeVisible();
  await expect(page.locator('#rh-progress-text')).toHaveText('0/90', { timeout: 6_000 });
  await expect(page.locator('#rh-progress-fill')).toHaveJSProperty('style.width', '0%');
  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)');
  await expect(page.locator('.rh-task-item')).toHaveCount(2);
  await expect(page.locator('.rh-task-item').first()).toContainText('Daily poll');
  await expect(page.locator('.rh-task-item').nth(1)).toContainText('NASA Artemis mission');
  await expect(page.locator('.rh-task-item span').first()).toHaveText('⏳');
});

test('uses card topic keywords for a queued keyword-dependent task', async ({ page }) => {
  await loadUserscriptFixture(page, {
    isSearching: true,
    currentProgress: {
      current: 12,
      total: 90,
      lastChecked: 12,
      completed: false,
      noProgressCount: 0,
    },
    usedSearchTerms: [],
    dailyTasksQueue: [{
      url: '/rewards/task/nasa-artemis',
      title: 'NASA Artemis mission',
      status: '未完成',
      points: 10,
      queryCandidates: ['NASA Artemis mission', 'Artemis mission'],
      attempts: 1,
    }],
    attemptedTasks: [],
  });

  await expect(page.locator('#rh-progress-text')).toHaveText('12/90');
  const term = await page.evaluate(() => (window as any).__e2e_getSearchTerm());
  expect(term).toBe('NASA Artemis mission');
});

test('restores saved in-progress UI state from localStorage', async ({ page }) => {
  await loadUserscriptFixture(page, {
    isSearching: true,
    currentProgress: {
      current: 45,
      total: 90,
      lastChecked: 45,
      completed: false,
      noProgressCount: 0,
    },
    usedSearchTerms: ['existing term'],
    dailyTasksQueue: [],
    attemptedTasks: [],
  });

  await expect(page.locator('#rh-progress-text')).toHaveText('45/90');
  await expect(page.locator('#rh-badge-text')).toHaveText('45/90');
  await expect(page.locator('#rh-progress-fill')).toHaveJSProperty('style.width', '50%');
  await expect(page.locator('#rh-start-btn')).toContainText('Stop Farming');
  await expect(page.locator('#rh-badge')).toHaveClass(/searching/);
  expect(await page.evaluate(() => (window as any).__e2e_isDedicatedWorker())).toBe(false);
  expect(await page.evaluate(() => (window as any).__e2e_isLocalSearchRunning())).toBe(false);
});

test('restores saved completed UI state from localStorage', async ({ page }) => {
  await loadUserscriptFixture(page, {
    isSearching: true,
    currentProgress: {
      current: 90,
      total: 90,
      lastChecked: 90,
      completed: true,
      noProgressCount: 0,
    },
    usedSearchTerms: [],
    dailyTasksQueue: [],
    attemptedTasks: [],
  });

  await expect(page.locator('#rh-progress-text')).toHaveText('✅ Done');
  await expect(page.locator('#rh-badge-text')).toHaveText('✅ Done');
  await expect(page.locator('#rh-progress-fill')).toHaveJSProperty('style.width', '100%');
});

test('exposes an e2e hook that can submit through the Bing search form', async ({ page }) => {
  await loadUserscriptFixture(page);

  const submitted = await page.evaluate(() => {
    return (window as any).__e2e_simulateTypingAndSearch('playwright check');
  });

  expect(submitted).toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.lastQuery))
    .toBe('playwright check');
});
