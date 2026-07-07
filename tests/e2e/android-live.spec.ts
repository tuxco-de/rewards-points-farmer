import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const enabled = process.env.PLAYWRIGHT_ANDROID_LIVE === '1';
const userscriptPath = path.resolve(__dirname, '../../dist/rewards-points-farmer.user.js');
const cdpEndpoint = 'http://127.0.0.1:9222';
const liveUrl = 'https://www.bing.com/search?q=playwright%20android%20live';
const rewardsEntrySelector = '.points-container, #id_rc, #rewards-badge';
const rewardsFlyoutSelector = 'iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout, iframe.b_rwFlyout';
const loginCookieNames = new Set(['_U', 'WLS', '.MSA.Auth', 'WLSSC']);

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

async function connectAndroidLivePage(): Promise<{ browser: Browser; page: Page }> {
  adb(['forward', 'tcp:9222', 'localabstract:chrome_devtools_remote']);
  adb(['shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', liveUrl]);

  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0] || await browser.newContext();
  await context.addInitScript(() => {
    localStorage.removeItem('bing_rewards_auto_searcher_state');
  });
  await context.addInitScript({ path: userscriptPath });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(liveUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForFunction(() => typeof (window as any).startRewardsTask === 'function', null, {
    timeout: 15_000,
  });
  return { browser, page };
}

async function closeBrowser(browser: Browser) {
  await Promise.race([
    browser.close(),
    new Promise<void>(resolve => setTimeout(resolve, 3_000)),
  ]);
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

function sanitizeCookieName(name: string) {
  if (name.startsWith('.MSA.Auth.Nonce.')) return '.MSA.Auth.Nonce.*';
  if (name.startsWith('.MSA.Auth.Correlation.')) return '.MSA.Auth.Correlation.*';
  return name;
}

async function getAndroidBingLoginState(page: Page) {
  const cookies = await page.context().cookies([
    'https://www.bing.com',
    'https://cn.bing.com',
    'https://rewards.bing.com',
    'https://login.live.com',
  ]);
  const cookieNames = [...new Set(cookies.map(cookie => sanitizeCookieName(cookie.name)))].sort();
  const hasStrongLoginCookie = cookies.some(cookie => loginCookieNames.has(cookie.name));
  const visibleSignInEntries = await page.evaluate(() => {
    const signInPattern = /sign\s*in|signin|log\s*in|login|\u767b\u5f55|\u767b\u5165/i;
    return Array.from(document.querySelectorAll('#id_s, #id_a, [id*="signin"], [href*="signin"]'))
      .filter(el => el instanceof HTMLElement && el.offsetParent !== null)
      .map(el => ({
        id: el.id,
        text: (el.textContent || '').trim(),
        aria: el.getAttribute('aria-label') || '',
        href: el.getAttribute('href') || '',
      }))
      .filter(item => signInPattern.test(`${item.id} ${item.text} ${item.aria} ${item.href}`));
  });

  return {
    cookieNames,
    hasStrongLoginCookie,
    hasVisibleSignInEntry: visibleSignInEntries.length > 0,
    visibleSignInEntries,
  };
}

function isAndroidBingLoggedInState(state: Awaited<ReturnType<typeof getAndroidBingLoginState>>) {
  return state.hasStrongLoginCookie && !state.hasVisibleSignInEntry;
}

function formatAndroidBingLoginState(state: Awaited<ReturnType<typeof getAndroidBingLoginState>>) {
  return [
    `hasStrongLoginCookie=${state.hasStrongLoginCookie}`,
    `hasVisibleSignInEntry=${state.hasVisibleSignInEntry}`,
    `cookieNames=${state.cookieNames.join(',')}`,
    `visibleSignInEntries=${JSON.stringify(state.visibleSignInEntries)}`,
  ].join(' ');
}

async function expectAndroidBingLoggedIn(page: Page) {
  const state = await getAndroidBingLoginState(page);
  if (!isAndroidBingLoggedInState(state)) {
    throw new Error(`Android Bing login validation failed. ${formatAndroidBingLoginState(state)}`);
  }
}

async function skipIfAndroidBingNotLoggedIn(page: Page) {
  const state = await getAndroidBingLoginState(page);
  test.skip(!isAndroidBingLoggedInState(state), `Android Bing is not logged in. ${formatAndroidBingLoginState(state)}`);
}

test.describe('Android live Bing readonly @android-live', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!enabled, 'Run npm run test:e2e:android:live to execute Android live tests.');
  test.skip(enabled && !hasAdbDevice(), 'No authorized ADB device is available.');

  test.afterEach(() => {
    if (enabled) {
      try {
        adb(['forward', '--remove', 'tcp:9222']);
      } catch {
        // Cleanup best-effort only.
      }
    }
  });

  test('validates the current Android Chrome Bing login state', async () => {
    const { browser, page } = await connectAndroidLivePage();

    try {
      await expectAndroidBingLoggedIn(page);
      await expectSearchNotStarted(page);
    } finally {
      await closeBrowser(browser);
    }
  });

  test('injects the userscript UI on live Bing without starting automation', async () => {
    const { browser, page } = await connectAndroidLivePage();

    try {
      await skipIfAndroidBingNotLoggedIn(page);
      await expect(page.locator('#rh-badge')).toBeVisible({ timeout: 15_000 });
      await page.locator('#rh-badge').click();
      await expect(page.locator('#rh-dropdown')).toBeVisible();
      await expect(page.locator('#rh-start-btn')).toBeVisible();
      await expectSearchNotStarted(page);
    } finally {
      await closeBrowser(browser);
    }
  });

  test('opens the live Rewards flyout when the Android page exposes a Rewards entry', async () => {
    const { browser, page } = await connectAndroidLivePage();

    try {
      await skipIfAndroidBingNotLoggedIn(page);
      const rewardsEntry = page.locator(rewardsEntrySelector).first();
      const entryCount = await page.locator(rewardsEntrySelector).count();
      test.skip(entryCount === 0, 'The current Android Bing page does not expose a Rewards entry.');

      await rewardsEntry.click();
      await expect(page.locator(rewardsFlyoutSelector).first()).toBeVisible({ timeout: 15_000 });
      await expectSearchNotStarted(page);
    } finally {
      await closeBrowser(browser);
    }
  });
});
