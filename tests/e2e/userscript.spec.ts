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

async function loadUserscriptFixture(page: Page, savedState?: SavedState) {
  if (savedState) {
    await page.addInitScript(state => {
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

  await page.addInitScript({ path: userscriptPath });
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => typeof (window as any).startRewardsTask === 'function');
}

test('shows the collapsed badge and opens the control panel from the badge', async ({ page }) => {
  await loadUserscriptFixture(page);

  await expect(page.locator('#rh-badge')).toBeVisible();
  await expect(page.locator('#rh-badge-text')).toHaveText(/Initializing|0\/90/);
  await expect(page.locator('#rh-dropdown')).toBeHidden();

  await page.locator('#rh-badge').click();
  await expect(page.locator('#rh-dropdown')).toBeVisible();
  await expect(page.locator('#rh-start-btn')).toContainText('Start Farming');
  await expect(page.locator('.rh-header')).toContainText('Rewards Points Farmer');
});

test('closes the control panel when clicking outside it', async ({ page }) => {
  await loadUserscriptFixture(page);

  await page.locator('#rh-badge').click();
  await expect(page.locator('#rh-dropdown')).toBeVisible();

  await page.locator('#content').click();
  await expect(page.locator('#rh-dropdown')).toBeHidden();
});

test('injects the userscript UI and parses the rewards flyout', async ({ page }) => {
  await loadUserscriptFixture(page);

  await expect(page.locator('#rh-badge')).toBeVisible();
  await expect(page.locator('#rh-progress-text')).toHaveText('0/90', { timeout: 6_000 });
  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)');
  await expect(page.locator('#rh-tasks-list')).toContainText('Daily poll');
  await expect(page.locator('#rh-tasks-list')).toContainText('NASA Artemis mission');
});

test('renders parsed task state in the dropdown task list', async ({ page }) => {
  await loadUserscriptFixture(page);

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
