import { sleep } from './state';

export const REWARDS_ENTRY_SELECTOR = [
    '#id_rh_w',
    '[aria-controls="rewid-f"]',
    'a[role="button"][aria-label*="Microsoft Rewards" i]',
    'button[aria-label*="Microsoft Rewards" i]',
    '.points-container',
    '#id_rc',
    '#rewards-badge'
].join(', ');

export const REWARDS_FLYOUT_SELECTOR = [
    'iframe[src*="/rewards/panelflyout"]',
    '#rewid-f iframe',
    'iframe[title*="Microsoft Rewards" i]',
    'iframe#b_rwFlyout',
    'iframe.b_rwFlyout'
].join(', ');

export const SEARCH_INPUT_SELECTOR = [
    '#sb_form_q',
    'form[action*="/search"] input[name="q"]',
    'input[name="q"][type="search"]',
    'input[role="searchbox"]'
].join(', ');

export const SEARCH_SUBMIT_SELECTOR = [
    '#sb_form_go',
    '#search_icon',
    'form[action*="/search"] button[type="submit"]',
    'form[action*="/search"] input[type="submit"]',
    '#sb_form button[type="submit"]',
    '#sb_form input[type="submit"]'
].join(', ');

export const SEARCH_FORM_SELECTOR = '#sb_form, form[action*="/search"]';
export const SEARCH_RESULT_SELECTOR = '.b_algo, #b_results > li, main[aria-label*="search" i] h2, main[aria-label*="搜索"] h2';

function isElementVisible(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement) || element.getAttribute('aria-hidden') === 'true') return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

export function findVisibleElement(selector: string, context: Document | Element = document): HTMLElement | null {
    return Array.from(context.querySelectorAll(selector)).find(isElementVisible) || null;
}

export function getRewardsFlyoutIframe(): HTMLIFrameElement | null {
    const frames = Array.from(document.querySelectorAll(REWARDS_FLYOUT_SELECTOR)) as HTMLIFrameElement[];
    return frames.find(isElementVisible) || frames[0] || null;
}

export async function waitForElement(selector: string, timeout = 5000, context: Document | Element = document): Promise<Element | null> {
    let el = context.querySelector(selector);
    if (el) return el;
    return new Promise(resolve => {
        const observer = new MutationObserver((mutations, obs) => {
            const el = context.querySelector(selector);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });
        observer.observe((context as any).body || context, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

export async function waitForVisibleElement(selector: string, timeout = 5000, context: Document | Element = document): Promise<HTMLElement | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        const element = findVisibleElement(selector, context);
        if (element) return element;
        await sleep(100);
    }
    return null;
}

export async function simulateMouseInteraction(element: Element) {
    if (!element) return;
    try {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const targetX = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
        const targetY = rect.top + rect.height / 2 + (Math.random() * 10 - 5);
        
        element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
        await sleep(100 + Math.random() * 200);
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
        await sleep(50 + Math.random() * 100);
    } catch (e) {
        console.warn('模拟鼠标交互出错:', e);
    }
}

function clickRewardsEntry(element: HTMLElement) {
    const anchor = element.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) {
        element.click();
        return;
    }

    const preventNavigation = (event: Event) => event.preventDefault();
    anchor.addEventListener('click', preventNavigation, { capture: true, once: true });
    element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true
    }));
}

export function isDarkMode() {
    const html = document.documentElement;
    if (html.classList.contains('b_dark') || document.body?.classList.contains('b_dark')) return true;
    if (html.getAttribute('data-darkmode') === 'true') return true;
    if (document.body) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export async function closeRewardsSidebarAsync() {
    try {
        const iframe = getRewardsFlyoutIframe();
        if (iframe) {
            const pointsContainer = findVisibleElement(REWARDS_ENTRY_SELECTOR);
            if (pointsContainer) {
                clickRewardsEntry(pointsContainer);
                console.log('已点击积分按钮，关闭侧边栏');
                await sleep(1000);
            }
        }
    } catch(e) {
        console.warn('关闭侧边栏出错:', e);
    }
}

export async function openRewardsSidebarAsync() {
    const openedFrame = getRewardsFlyoutIframe();
    if (openedFrame && isElementVisible(openedFrame)) return true;

    const pointsContainer = await waitForVisibleElement(REWARDS_ENTRY_SELECTOR, 5000);
    if (pointsContainer) {
        clickRewardsEntry(pointsContainer);
        console.log('已点击积分按钮，正在打开侧边栏...');
        return Boolean(await waitForElement(REWARDS_FLYOUT_SELECTOR, 5000));
    } else {
        console.log('未找到积分按钮');
        return false;
    }
}

/**
 * Wait for the rewards iframe to appear AND have meaningful content rendered.
 * Polls every 500ms. Returns the iframe element or null on timeout.
 */
export async function waitForIframeContent(timeout = 10000): Promise<HTMLIFrameElement | null> {
    const POLL_INTERVAL = 500;
    const MIN_CONTENT_LENGTH = 30; // iframe body must have at least this many chars
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const iframe = getRewardsFlyoutIframe();

        if (iframe) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc && (doc.readyState === 'complete' || doc.readyState === 'interactive')) {
                    const bodyText = (doc.body?.innerText || '').trim();
                    const rewardsRoot = doc.querySelector('#app, #bingRewards, .promo_cont, .rw-card, .search_earn_card, [aria-label*="Rewards" i]');
                    if (bodyText.length >= MIN_CONTENT_LENGTH && rewardsRoot) {
                        console.log(`[RewardsHelper] iframe 内容就绪 (${bodyText.length} 字符, 耗时 ${Date.now() - startTime}ms)`);
                        return iframe;
                    }
                }
            } catch (e) {
                // Cross-origin or not ready yet, keep polling
            }
        }

        await sleep(POLL_INTERVAL);
    }

    console.log(`[RewardsHelper] iframe 内容等待超时 (${timeout}ms)，尝试继续解析`);
    // Return the iframe anyway so the caller can still attempt to parse
    return getRewardsFlyoutIframe();
}

export async function simulateTypingAndSearch(searchTerm: string): Promise<boolean> {
    try {
        const input = findVisibleElement(SEARCH_INPUT_SELECTOR) as HTMLInputElement | null;
        if (!input) {
            console.log('[RewardsHelper] 未找到搜索框，放弃模拟打字');
            return false;
        }

        await simulateMouseInteraction(input);
        input.focus();
        await sleep(100);

        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (valueSetter) valueSetter.call(input, '');
        else input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(100);

        for (let i = 0; i < searchTerm.length; i++) {
            const nextValue = input.value + searchTerm[i];
            if (valueSetter) valueSetter.call(input, nextValue);
            else input.value = nextValue;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(50 + Math.random() * 150);
        }
        
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200 + Math.random() * 300);

        const searchBtn = findVisibleElement(SEARCH_SUBMIT_SELECTOR);
        const searchForm = input.closest('form') || document.querySelector(SEARCH_FORM_SELECTOR) as HTMLFormElement | null;

        if (searchBtn) {
            await simulateMouseInteraction(searchBtn);
            searchBtn.click();
            console.log('[RewardsHelper] 通过点击按钮提交搜索');
            return true;
        } else if (searchForm) {
            searchForm.requestSubmit();
            console.log('[RewardsHelper] 通过表单提交搜索');
            return true;
        } else {
            console.log('[RewardsHelper] 未找到搜索按钮或表单，使用键盘回车事件提交');
            const enterEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
            input.dispatchEvent(enterEvent);
            return true;
        }
    } catch (e) {
        console.warn('[RewardsHelper] 模拟打字出错:', e);
        return false;
    }
}
