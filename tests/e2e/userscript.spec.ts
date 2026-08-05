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
  totalSearchAttempts?: number;
  dailyTasksQueue?: Array<{
    url: string;
    title: string;
    status: '未完成' | '已完成';
    points: number;
    kind: 'search-promotion' | 'navigation';
    searchTerms: string[];
    attempts: number;
  }>;
  attemptedTasks?: string[];
};

async function loadUserscriptFixture(
  page: Page,
  savedState?: SavedState,
  options: { worker?: boolean; pointsComplete?: boolean; menuApi?: boolean; modernLayout?: boolean; rejectMouseEventView?: boolean; englishSummary?: boolean; completedChineseSummary?: boolean; hundredTotal?: boolean; completedCard?: boolean; reactiveAutocomplete?: boolean; unconfiguredPromotion?: boolean; unconfiguredEnglishPromotion?: boolean; currentRewardsCards?: boolean } = {}
) {
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

  if (options.menuApi) {
    await page.context().addInitScript(() => {
      (window as any).__e2e_menuCommands = [];
      (window as any).GM_registerMenuCommand = (caption: string, onClick: () => void) => {
        (window as any).__e2e_menuCommands.push({ caption, onClick });
        return caption;
      };
    });
  }

  if (options.rejectMouseEventView) {
    await page.context().addInitScript(() => {
      const NativeMouseEvent = window.MouseEvent;
      window.MouseEvent = new Proxy(NativeMouseEvent, {
        construct(target, args) {
          if (args[1]?.view) throw new TypeError('MouseEvent view must be a native Window');
          return Reflect.construct(target, args);
        },
      });
    });
  }

  await page.context().addInitScript({ path: userscriptPath });
  const url = new URL(fixtureUrl);
  if (options.worker) url.searchParams.set('rewards_helper_worker', '1');
  if (options.pointsComplete) url.searchParams.set('pointsComplete', '1');
  if (options.modernLayout) url.searchParams.set('modernLayout', '1');
  if (options.englishSummary) url.searchParams.set('englishSummary', '1');
  if (options.completedChineseSummary) url.searchParams.set('completedChineseSummary', '1');
  if (options.hundredTotal) url.searchParams.set('hundredTotal', '1');
  if (options.completedCard) url.searchParams.set('completedCard', '1');
  if (options.reactiveAutocomplete) url.searchParams.set('reactiveAutocomplete', '1');
  if (options.unconfiguredPromotion) url.searchParams.set('unconfiguredPromotion', '1');
  if (options.unconfiguredEnglishPromotion) url.searchParams.set('unconfiguredEnglishPromotion', '1');
  if (options.currentRewardsCards) url.searchParams.set('currentRewardsCards', '1');
  await page.goto(url.toString());
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

test('checks the latest release from the settings panel', async ({ page }) => {
  await page.route('https://api.github.com/repos/tuxco-de/rewards-points-farmer/releases/latest', route =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        tag_name: 'v9.9.9',
        html_url: 'https://github.com/tuxco-de/rewards-points-farmer/releases/tag/v9.9.9',
      }),
    })
  );
  await loadUserscriptFixture(page);

  await page.locator('#rh-badge').click();
  await page.locator('#rh-settings-toggle').click();
  await expect(page.locator('#rh-settings-view')).toContainText(/Current version: v\d+\.\d+\.\d+/);
  await page.locator('#rh-check-updates').click();

  await expect(page.locator('#rh-toast')).toContainText('Version v9.9.9 is available');
  await expect(page.locator('#rh-check-updates')).toHaveText('Check for updates');
  await expect(page.locator('#rh-check-updates')).toBeEnabled();
});

test('registers regular actions in the userscript menu', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { menuApi: true });

  const captions = await page.evaluate(() =>
    (window as any).__e2e_menuCommands.map((command: { caption: string }) => command.caption)
  );
  expect(captions).toEqual(['Start dedicated task', 'Stop task', 'Open settings', 'Check for updates']);

  await page.evaluate(() => {
    const settingsCommand = (window as any).__e2e_menuCommands.find(
      (command: { caption: string }) => command.caption === 'Open settings'
    );
    settingsCommand.onClick();
  });
  await expect(page.locator('#rh-dropdown')).toBeVisible();
  await expect(page.locator('#rh-settings-view')).toBeVisible();
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

test('claims explicit Dashboard point controls before creating the task UI', async ({ page }) => {
  await page.context().addInitScript({ path: userscriptPath });
  const url = new URL(fixtureUrl);
  url.searchParams.set('rewards_helper_claim', '1');
  url.searchParams.set('claimablePoints', '1');
  await page.goto(url.toString());

  await expect.poll(() => page.evaluate(() => document.body.dataset.claimedPoints || '0')).toBe('3');
  expect(await page.evaluate(() => document.body.dataset.redeemClicked)).toBeUndefined();
  await expect(page.locator('#rewards-helper-container')).toHaveCount(0);
});

test('opens one dedicated task tab and accepts stop commands from the controller', async ({ page, context }) => {
  await loadUserscriptFixture(page);

  const workerPromise = context.waitForEvent('page');
  await page.locator('#rh-badge').click();
  await page.locator('#rh-start-btn').click();
  const worker = await workerPromise;
  await worker.waitForFunction(() => typeof (window as any).__e2e_isDedicatedWorker === 'function');

  expect(new URL(worker.url()).searchParams.get('rewards_helper_worker')).toBe('1');
  expect(new URL(worker.url()).searchParams.get('rewards_helper_claim_checked')).toBe('1');
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
  await expect.poll(
    () => worker.evaluate(() => (window as any).__e2e_isLocalSearchRunning?.() || false).catch(() => false),
    { timeout: 15_000 }
  ).toBe(true);
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

  const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
  expect(queue.map((task: { kind: string }) => task.kind)).toEqual(['navigation', 'navigation']);
  expect(queue.map((task: { searchTerms: string[] }) => task.searchTerms)).toEqual([[], []]);
});

test('prefers the multiline English earned summary over an unrelated 80-point fraction', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { worker: true, englishSummary: true });

  await expect(page.locator('#rh-progress-text')).toHaveText('80/200', { timeout: 6_000 });
  await expect(page.locator('#rh-progress-fill')).toHaveJSProperty('style.width', '40%');
  expect(await page.evaluate(() => (window as any).__e2e_getExecutionPhase())).toBe('points');
});

test('uses the completed Chinese reward-points summary instead of an unrelated search fraction', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, {
    worker: true,
    modernLayout: true,
    completedChineseSummary: true,
  });

  await expect(page.locator('#rh-progress-text')).toHaveText('✅ Done', { timeout: 6_000 });
  expect(await page.evaluate(() => (window as any).__e2e_getCurrentProgress())).toMatchObject({
    current: 200,
    total: 200,
    completed: true,
  });
});

test('accepts a 100-point search total', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { worker: true, modernLayout: true, hundredTotal: true });

  await expect(page.locator('#rh-progress-text')).toHaveText('0/100', { timeout: 6_000 });
  expect(await page.evaluate(() => (window as any).__e2e_getExecutionPhase())).toBe('points');
});

test('counts no progress when a completed search attempt still leaves progress at zero', async ({ page }) => {
  await loadUserscriptFixture(page, {
    isSearching: true,
    currentProgress: {
      current: 0,
      total: 200,
      lastChecked: 0,
      completed: false,
      noProgressCount: 0,
    },
    totalSearchAttempts: 1,
    usedSearchTerms: ['search attempt without points'],
    dailyTasksQueue: [],
    attemptedTasks: [],
  }, { worker: true, modernLayout: true });

  await expect
    .poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('bing_rewards_auto_searcher_state') || '{}');
      return state.currentProgress?.noProgressCount;
    }), { timeout: 8_000 })
    .toBe(1);
});

test('does not queue a completed card whose point label still says points', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { worker: true, modernLayout: true, completedCard: true });

  await expect(page.locator('#rh-tasks-count')).toHaveText('(1/2)', { timeout: 6_000 });
  const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
  expect(queue.map((task: { title: string }) => task.title)).toEqual(['查找住宿地点']);
});

test('parses the redesigned Rewards entry, progress and promo cards', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { worker: true, modernLayout: true, rejectMouseEventView: true });

  await expect(page.locator('#id_rh_w')).toHaveAttribute('aria-controls', 'rewid-f');
  await expect(page.locator('#rh-progress-text')).toHaveText('0/200', { timeout: 6_000 });
  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)');
  await expect(page.locator('.rh-task-item').first()).toContainText('查找住宿地点');
  await expect(page.locator('.rh-task-item').nth(1)).toContainText('NASA Artemis mission');

  const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
  expect(queue).toHaveLength(2);
  expect(queue.map((task: { source: string }) => task.source)).toEqual(['card', 'card']);
  expect(queue.map((task: { kind: string }) => task.kind)).toEqual(['search-promotion', 'search-promotion']);
  expect(queue[0].searchTerms).toEqual(['住宿地点', '适合周末旅行的住宿地点']);
  expect(queue[1].searchTerms).toEqual(['NASA Artemis mission', 'Artemis II launch']);
  expect(queue.flatMap((task: { searchTerms: string[] }) => task.searchTerms)).toEqual(
    expect.not.arrayContaining([expect.stringMatching(/(?:https?:\/\/|bing\.com|^\/search)/i)])
  );
  expect(await page.evaluate(() => document.body.dataset.rewardsToggleCount)).toBe('1');
  expect(await page.evaluate(() => document.body.dataset.javascriptNavigation)).toBeUndefined();
});

test('keeps all current Rewards cards when browse activities share one URL', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, {
    worker: true,
    modernLayout: true,
    currentRewardsCards: true,
  });

  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/8)', { timeout: 6_000 });
  const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
  const titles = queue.map((task: { title: string }) => task.title);
  expect(titles).toEqual([
    '查找住宿地点',
    'NASA Artemis mission',
    '每日投票',
    '更智能的银行服务',
    '观看演出',
    '学习歌曲歌词',
    '驾驭您的旅程',
    '使用 Bing 预订航班',
  ]);
  expect(titles).not.toContain('将推荐转化为奖励');

  const sharedUrlTasks = queue.filter((task: { url: string }) => task.url.includes('form=ML2PCR'));
  expect(sharedUrlTasks).toHaveLength(4);
  expect(sharedUrlTasks.map((task: { searchTerms: string[] }) => task.searchTerms)).toEqual([
    ['支票账户', '储蓄账户', '高收益储蓄账户'],
    ['附近音乐会门票', '现场演出门票', '近期音乐会'],
    ['热门歌曲歌词', '经典歌曲歌词', '最喜欢的歌曲歌词'],
    ['旅行租车', '机场租车优惠', '便宜租车'],
  ]);
  expect(queue.find((task: { title: string }) => task.title === '使用 Bing 预订航班')?.searchTerms).toEqual([
    '廉价机票',
    '最低票价航班',
    '航班预订',
  ]);
});

test('warns and uses description-first fallback terms for an unconfigured search promotion', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', message => consoleMessages.push(message.text()));

  await loadUserscriptFixture(page, undefined, {
    worker: true,
    modernLayout: true,
    unconfiguredPromotion: true,
  });

  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)', { timeout: 6_000 });
  const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
  const task = queue.find((item: { title: string }) => item.title === '规划你的未来');

  expect(task).toMatchObject({
    kind: 'search-promotion',
    searchTerms: ['个人贷款', '学生贷款'],
  });
  await expect.poll(() => consoleMessages.filter(message => message.includes('未找到固定词配置'))).toEqual([
    '[RewardsHelper] 搜索推广卡 "规划你的未来" 未找到固定词配置，将按页面语义兜底: 个人贷款 | 学生贷款',
  ]);
});

test('uses English segmentation for an unconfigured English search promotion', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', message => consoleMessages.push(message.text()));

  await loadUserscriptFixture(page, undefined, {
    worker: true,
    modernLayout: true,
    unconfiguredEnglishPromotion: true,
  });

  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)', { timeout: 6_000 });
  const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
  const task = queue.find((item: { title: string }) => item.title === 'Plan your future');

  expect(task).toMatchObject({
    kind: 'search-promotion',
    searchTerms: ['personal loan', 'student loan'],
  });
  await expect.poll(() => consoleMessages.filter(message => message.includes('未找到固定词配置'))).toEqual([
    '[RewardsHelper] 搜索推广卡 "Plan your future" 未找到固定词配置，将按页面语义兜底: personal loan | student loan',
  ]);
});

test.describe('Rewards DOM value integration matrix', () => {
  const scenarios = [
    {
      name: 'legacy numeric progress',
      options: { worker: true },
      expected: { current: 0, total: 90, completed: false },
    },
    {
      name: 'legacy multiline English summary',
      options: { worker: true, englishSummary: true },
      expected: { current: 80, total: 200, completed: false },
    },
    {
      name: 'modern 200-point progress',
      options: { worker: true, modernLayout: true },
      expected: { current: 0, total: 200, completed: false },
    },
    {
      name: 'modern 100-point progress',
      options: { worker: true, modernLayout: true, hundredTotal: true },
      expected: { current: 0, total: 100, completed: false },
    },
    {
      name: 'modern completed numeric progress',
      options: { worker: true, modernLayout: true, pointsComplete: true },
      expected: { current: 200, total: 200, completed: true },
    },
    {
      name: 'modern completed Chinese reward-points summary',
      options: { worker: true, modernLayout: true, completedChineseSummary: true },
      expected: { current: 200, total: 200, completed: true },
    },
  ] as const;

  for (const scenario of scenarios) {
    test(`parses ${scenario.name}`, async ({ page }) => {
      await loadUserscriptFixture(page, undefined, scenario.options);

      await expect
        .poll(() => page.evaluate(() => (window as any).__e2e_getCurrentProgress()), { timeout: 6_000 })
        .toMatchObject(scenario.expected);
    });
  }

  test('collects progress, cards and search terms in one parsed snapshot', async ({ page }) => {
    await loadUserscriptFixture(page, undefined, { worker: true, modernLayout: true });

    await expect(page.locator('#rh-progress-text')).toHaveText('0/200', { timeout: 6_000 });
    const snapshot = await page.evaluate(() => (window as any).__e2e_getParsedSnapshot());

    expect(snapshot.currentProgress).toMatchObject({ current: 0, total: 200, completed: false });
    expect(snapshot.dailyTasksData).toEqual([
      { name: '查找住宿地点', status: '未完成' },
      { name: 'NASA Artemis mission', status: '未完成' },
    ]);
    expect(snapshot.dailyTasksQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '查找住宿地点',
        points: 10,
        kind: 'search-promotion',
        source: 'card',
        searchTerms: ['住宿地点', '适合周末旅行的住宿地点'],
      }),
      expect.objectContaining({
        title: 'NASA Artemis mission',
        points: 10,
        kind: 'search-promotion',
        source: 'card',
        searchTerms: ['NASA Artemis mission', 'Artemis II launch'],
      }),
    ]));
    expect(snapshot.mainPageSearchTerms).toEqual(expect.arrayContaining([
      'weather forecast',
      'technology news',
    ]));
    expect(snapshot.iframeSearchTerms).toEqual(expect.arrayContaining([
      'summer travel',
      'technology news',
    ]));
  });
});

test('refreshes persisted promotion terms from the repository config', async ({ page }) => {
  await loadUserscriptFixture(page, {
    isSearching: false,
    currentProgress: {
      current: 0,
      total: 200,
      lastChecked: 0,
      completed: false,
      noProgressCount: 0,
    },
    usedSearchTerms: [],
    dailyTasksQueue: [{
      url: '/rewards/task/nasa-artemis',
      title: 'NASA Artemis mission',
      status: '未完成',
      points: 10,
      kind: 'search-promotion',
      searchTerms: ['stale browser term'],
      attempts: 0,
    }],
    attemptedTasks: [],
  }, { worker: true, modernLayout: true });

  await expect
    .poll(async () => {
      const queue = await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue());
      return queue.find((task: { title: string }) => task.title === 'NASA Artemis mission')?.searchTerms;
    }, { timeout: 6_000 })
    .toEqual(['NASA Artemis mission', 'Artemis II launch']);
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

test('defers queued card keywords while search points are incomplete', async ({ page }) => {
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
    mainPageSearchTerms: ['points phase search term'],
    dailyTasksQueue: [{
      url: '/rewards/task/nasa-artemis',
      title: 'NASA Artemis mission',
      status: '未完成',
      points: 10,
      kind: 'search-promotion',
      searchTerms: [
        'NASA Artemis mission',
        'Artemis mission',
      ],
      attempts: 1,
    }],
    attemptedTasks: [],
  });

  await expect(page.locator('#rh-progress-text')).toHaveText('12/90');
  expect(await page.evaluate(() => (window as any).__e2e_getExecutionPhase())).toBe('points');
  const term = await page.evaluate(() => (window as any).__e2e_getSearchTerm());
  expect(term).toBe('points phase search term');
});

test('uses the next fixed promotion term after the previous term was attempted', async ({ page }) => {
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
    mainPageSearchTerms: ['points phase search term'],
    dailyTasksQueue: [{
      url: '/rewards/task/nasa-artemis',
      title: 'NASA Artemis mission',
      status: '未完成',
      points: 10,
      kind: 'search-promotion',
      searchTerms: [
        'NASA Artemis mission',
        'Artemis II launch',
      ],
      attempts: 2,
    }],
    attemptedTasks: [],
  });

  expect(await page.evaluate(() => (window as any).__e2e_getExecutionPhase())).toBe('cards');
  const term = await page.evaluate(() => (window as any).__e2e_getSearchTerm());
  expect(term).toBe('Artemis II launch');
});

test('does not fall back to random terms after a promotion exhausts its fixed terms', async ({ page }) => {
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
    mainPageSearchTerms: ['must not be used'],
    dailyTasksQueue: [{
      url: '/rewards/task/nasa-artemis',
      title: 'NASA Artemis mission',
      status: '未完成',
      points: 10,
      kind: 'search-promotion',
      searchTerms: ['NASA Artemis mission', 'Artemis II launch'],
      attempts: 3,
    }],
    attemptedTasks: [],
  });

  const term = await page.evaluate(() => (window as any).__e2e_getSearchTerm());
  expect(term).toBe('');
});

test('finishes immediately and renders skipped state when the last queued card reaches its attempt limit', async ({ page }) => {
  await loadUserscriptFixture(page, {
    isSearching: false,
    currentProgress: {
      current: 200,
      total: 200,
      lastChecked: 200,
      completed: true,
      noProgressCount: 0,
    },
    usedSearchTerms: [],
    dailyTasksQueue: [{
      url: '/search?q=https%3A%2F%2Fwww.bing.com%2Frewards',
      title: '查找住宿地点',
      status: '未完成',
      points: 10,
      kind: 'search-promotion',
      searchTerms: ['住宿地点', '适合周末旅行的住宿地点'],
      attempts: 3,
    }],
    attemptedTasks: [],
  }, {
    worker: true,
    pointsComplete: true,
    modernLayout: true,
    completedCard: true,
  });

  await expect(page.locator('#rh-progress-text')).toHaveText('✅ Done', { timeout: 6_000 });
  await page.evaluate(() => (window as any).startRewardsTask());

  await expect.poll(
    () => page.evaluate(() => (window as any).__e2e_isLocalSearchRunning()),
    { timeout: 3_000 }
  ).toBe(false);
  await expect(page.locator('#rh-start-btn')).toContainText('Start Farming');
  await expect(page.locator('#rh-status-text')).toContainText('Search tasks completed');
  await expect(page.locator('#rh-tasks-count')).toHaveText('(1/2, skipped 1)');
  await expect(page.locator('.rh-task-item').filter({ hasText: '查找住宿地点' })).toContainText('⏭️');
});

test('executes a search promotion with its first fixed term when the card query is a URL', async ({ page }) => {
  test.setTimeout(45_000);
  await loadUserscriptFixture(page, undefined, { worker: true, pointsComplete: true, modernLayout: true, rejectMouseEventView: true });

  await expect(page.locator('#rh-progress-text')).toHaveText('✅ Done', { timeout: 6_000 });
  await expect(page.locator('#rh-tasks-count')).toHaveText('(0/2)');
  await expect(page.locator('#rewid-f')).toHaveCount(1);

  await page.evaluate(() => (window as any).startRewardsTask());

  await expect
    .poll(() => page.evaluate(() => document.body.dataset.lastCardClick), { timeout: 10_000 })
    .toBe('/search?q=https%3A%2F%2Fwww.bing.com%2Frewards');
  expect(await page.evaluate(() => document.body.dataset.cardClickCount)).toBe('1');
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.lastQuery), { timeout: 25_000 })
    .toBe('住宿地点');

  const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('bing_rewards_auto_searcher_state') || '{}'));
  expect(savedState.dailyTasksQueue[0]).toMatchObject({
    title: '查找住宿地点',
    kind: 'search-promotion',
    attempts: 2,
  });
  expect(savedState.dailyTasksQueue[0].searchTerms).toEqual(
    expect.not.arrayContaining([expect.stringMatching(/(?:https?:\/\/|bing\.com|^\/search)/i)])
  );
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

test('ignores unsupported string entries in a persisted task queue', async ({ page }) => {
  await page.context().addInitScript(() => {
    localStorage.setItem('bing_rewards_auto_searcher_state', JSON.stringify({
      isSearching: false,
      currentProgress: {
        current: 0,
        total: 90,
        lastChecked: 0,
        completed: false,
        noProgressCount: 0,
      },
      dailyTasksQueue: ['/search?q=legacy-task'],
      attemptedTasks: [],
      lastActivityTime: Date.now(),
      timestamp: Date.now(),
    }));
  });
  await loadUserscriptFixture(page);

  expect(await page.evaluate(() => (window as any).__e2e_getDailyTaskQueue())).toEqual([]);
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

test('submits through the redesigned semantic Bing search form', async ({ page }) => {
  await loadUserscriptFixture(page, undefined, { modernLayout: true, reactiveAutocomplete: true });

  await expect(page.locator('#sb_form_q')).toHaveCount(0);
  await expect(page.locator('#sb_form_go')).toHaveCount(0);
  const submitted = await page.evaluate(() =>
    (window as any).__e2e_simulateTypingAndSearch('modern playwright check')
  );

  expect(submitted).toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.lastQuery))
    .toBe('modern playwright check');
  expect(await page.evaluate(() => document.body.dataset.inputEventCount)).toBe('1');
});
