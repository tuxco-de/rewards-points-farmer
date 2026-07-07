import { chromium, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const enabled = process.env.PLAYWRIGHT_ANDROID_ADB === '1';
const port = Number(process.env.PLAYWRIGHT_ANDROID_PORT || 41739);
const userscriptPath = path.resolve(__dirname, '../../dist/rewards-points-farmer.user.js');
const fixturePath = path.resolve(__dirname, 'fixtures/bing-shell.html');
const cdpEndpoint = 'http://127.0.0.1:9222';

let server: http.Server | undefined;
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
  dailyTasksQueue?: Array<{
    url: string;
    title: string;
    status: '未完成' | '已完成';
    points: number;
    queryCandidates: string[];
    attempts: number;
  }>;
  attemptedTasks?: string[];
};

function adb(args: string[]) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function hasAdbDevice() {
  try {
    return adb(['devices']).split(/\r?\n/).some(line => /\tdevice$/.test(line));
  } catch {
    return false;
  }
}

function startFixtureServer() {
  return new Promise<http.Server>((resolve, reject) => {
    const httpServer = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/fixtures/bing-shell.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(fixturePath));
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    });

    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', () => resolve(httpServer));
  });
}

async function connectAndroidChrome(savedState?: SavedState): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
  adb(['forward', 'tcp:9222', 'localabstract:chrome_devtools_remote']);
  adb(['shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', `http://127.0.0.1:${port}/fixtures/bing-shell.html`]);

  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0] || await browser.newContext();
  if (savedState) {
    await context.addInitScript(state => {
      localStorage.setItem(
        'bing_rewards_auto_searcher_state',
        JSON.stringify({
          ...state,
          lastActivityTime: Date.now(),
          timestamp: Date.now(),
        })
      );
    }, savedState);
  } else {
    await context.addInitScript(() => {
      localStorage.removeItem('bing_rewards_auto_searcher_state');
    });
  }
  await context.addInitScript({ path: userscriptPath });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/fixtures/bing-shell.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForFunction(() => typeof (window as any).startRewardsTask === 'function', null, {
    timeout: 15_000,
  });
  return { browser, context, page };
}

test.describe('Android ADB browser UI @android', () => {
  test.skip(!enabled, 'Set PLAYWRIGHT_ANDROID_ADB=1 or run npm run test:e2e:android.');
  test.skip(enabled && !hasAdbDevice(), 'No authorized ADB device is available.');

  test.beforeAll(async () => {
    server = await startFixtureServer();
  });

  test.afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>(resolve => server?.close(() => resolve()));
    }
    if (enabled) {
      try {
        adb(['forward', '--remove', 'tcp:9222']);
        adb(['reverse', '--remove', `tcp:${port}`]);
      } catch {
        // Cleanup best-effort only.
      }
    }
  });

  test('injects the userscript UI on the current ADB device Chrome', async () => {
    const { browser, page } = await connectAndroidChrome();

    try {
      await expect(page.locator('#rh-badge')).toBeVisible({ timeout: 15_000 });
      await page.locator('#rh-badge').click();
      await expect(page.locator('#rh-dropdown')).toBeVisible();
      await expect(page.locator('#rh-progress-text')).toHaveText('0/90', { timeout: 10_000 });
      await expect(page.locator('#rh-tasks-list')).toContainText('NASA Artemis mission');
    } finally {
      await browser.close();
    }
  });

  test('selects card topic keywords on the current ADB device Chrome', async () => {
    const { browser, page } = await connectAndroidChrome({
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

    try {
      await expect(page.locator('#rh-progress-text')).toHaveText('12/90', { timeout: 10_000 });
      const term = await page.evaluate(() => (window as any).__e2e_getSearchTerm());
      expect(term).toBe('NASA Artemis mission');
    } finally {
      await browser.close();
    }
  });
});
