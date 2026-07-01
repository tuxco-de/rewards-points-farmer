import { sleep } from './state';

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

export async function simulateMouseInteraction(element: Element) {
    if (!element) return;
    try {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const targetX = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
        const targetY = rect.top + rect.height / 2 + (Math.random() * 10 - 5);
        
        element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
        await sleep(100 + Math.random() * 200);
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
        await sleep(50 + Math.random() * 100);
    } catch (e) {
        console.warn('模拟鼠标交互出错:', e);
    }
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
        const iframe = document.querySelector('iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout');
        if (iframe) {
            const pointsContainer = document.querySelector('.points-container, #id_rc, #rewards-badge') as HTMLElement;
            if (pointsContainer) {
                pointsContainer.click();
                console.log('已点击积分按钮，关闭侧边栏');
                await sleep(1000);
            }
        }
    } catch(e) {
        console.warn('关闭侧边栏出错:', e);
    }
}

export async function openRewardsSidebarAsync() {
    const pointsContainer = await waitForElement('.points-container, #id_rc, #rewards-badge', 3000) as HTMLElement;
    if (pointsContainer) {
        pointsContainer.click();
        console.log('已点击积分按钮，正在打开侧边栏...');
        return true;
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
        const iframe = (
            document.querySelector('iframe[src*="rewards/panelflyout"]') ||
            document.querySelector('iframe#b_rwFlyout') ||
            document.querySelector('iframe.b_rwFlyout')
        ) as HTMLIFrameElement | null;

        if (iframe) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc && (doc.readyState === 'complete' || doc.readyState === 'interactive')) {
                    const bodyText = (doc.body?.textContent || '').trim();
                    if (bodyText.length >= MIN_CONTENT_LENGTH) {
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
    return (
        document.querySelector('iframe[src*="rewards/panelflyout"]') ||
        document.querySelector('iframe#b_rwFlyout') ||
        document.querySelector('iframe.b_rwFlyout')
    ) as HTMLIFrameElement | null;
}

export async function simulateTypingAndSearch(searchTerm: string): Promise<boolean> {
    try {
        const input = document.querySelector('input[name="q"], #sb_form_q') as HTMLInputElement;
        if (!input) {
            console.log('[RewardsHelper] 未找到搜索框，放弃模拟打字');
            return false;
        }

        await simulateMouseInteraction(input);
        input.focus();
        await sleep(100);

        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(100);

        for (let i = 0; i < searchTerm.length; i++) {
            input.value += searchTerm[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(50 + Math.random() * 150);
        }
        
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200 + Math.random() * 300);

        const searchBtn = document.querySelector('#search_icon, #sb_form_go') as HTMLElement;
        const searchForm = document.querySelector('#sb_form') as HTMLFormElement;

        if (searchBtn) {
            await simulateMouseInteraction(searchBtn);
            searchBtn.click();
            console.log('[RewardsHelper] 通过点击按钮提交搜索');
            return true;
        } else if (searchForm) {
            searchForm.submit();
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
