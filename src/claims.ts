const CLAIM_QUERY_PARAM = 'rewards_helper_claim';
const CLAIM_RETURN_PARAM = 'rewards_helper_return';
const CLAIM_CHECKED_PARAM = 'rewards_helper_claim_checked';
const CLAIM_SESSION_KEY = 'rewards_helper_claim_return';
const DASHBOARD_URL = 'https://rewards.bing.com/dashboard';
const MAX_CLAIM_CLICKS = 20;
const CLAIM_SCAN_INTERVAL_MS = 700;
const MIN_CLAIM_SCAN_MS = 5_000;
const POST_CLAIM_SETTLE_MS = 2_000;
const CLAIM_SCAN_TIMEOUT_MS = 15_000;

const CLAIM_LABEL_PATTERN = /^(?:(?:claim|collect)(?:\s+now)?(?:(?:\s+(?:my|your|the))?(?:\s+\d+)?(?:\s+microsoft rewards)?\s+points?)?|(?:confirm|yes,?\s+claim)(?:\s+points?)?|(?:立即|确认)?领取(?:\s*\d+\s*(?:个)?)?(?:积分)?|收取积分)$/i;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getClaimFlowReturnUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const queryReturnUrl = params.get(CLAIM_RETURN_PARAM) || '';
    if (queryReturnUrl) {
        sessionStorage.setItem(CLAIM_SESSION_KEY, queryReturnUrl);
        return queryReturnUrl;
    }
    return sessionStorage.getItem(CLAIM_SESSION_KEY) || '';
}

function isSafeReturnUrl(value: string): boolean {
    if (!value) return false;
    try {
        const url = new URL(value);
        if (window.location.protocol === 'file:' && url.protocol === 'file:') return true;
        return url.protocol === 'https:' &&
            (url.hostname === 'bing.com' || url.hostname.endsWith('.bing.com'));
    } catch {
        return false;
    }
}

function getElementLabels(element: Element): string[] {
    const htmlElement = element as HTMLElement;
    return [
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element instanceof HTMLInputElement ? element.value : '',
        htmlElement.innerText || element.textContent || ''
    ].map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function isVisibleAndEnabled(element: Element): boolean {
    const htmlElement = element as HTMLElement;
    const style = getComputedStyle(htmlElement);
    const rect = htmlElement.getBoundingClientRect();
    const disabled = element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true';
    return !disabled &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0;
}

function findClaimableControl(): HTMLElement | null {
    const controls = document.querySelectorAll<HTMLElement>(
        'button, a, [role="button"], input[type="button"], input[type="submit"]'
    );
    for (const control of Array.from(controls)) {
        if (control.dataset.rewardsHelperClaimAttempted === '1') continue;
        if (!isVisibleAndEnabled(control)) continue;
        const anchor = control.closest('a[href]') as HTMLAnchorElement | null;
        const href = anchor?.href.toLowerCase() || '';
        if (href.includes('/redeem')) continue;
        if (getElementLabels(control).some(label => CLAIM_LABEL_PATTERN.test(label))) {
            return control;
        }
    }
    return null;
}

function clickClaimControl(control: HTMLElement) {
    control.dataset.rewardsHelperClaimAttempted = '1';
    if (control instanceof HTMLAnchorElement) {
        control.removeAttribute('target');
    }
    control.click();
}

export function buildClaimCheckUrl(returnUrl: string): string {
    const dashboardUrl = window.location.protocol === 'file:'
        ? new URL(window.location.href)
        : new URL(DASHBOARD_URL);
    dashboardUrl.search = '';
    dashboardUrl.hash = '';
    dashboardUrl.searchParams.set(CLAIM_QUERY_PARAM, '1');
    dashboardUrl.searchParams.set(CLAIM_RETURN_PARAM, returnUrl);
    return dashboardUrl.toString();
}

export function isClaimCheckContext(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get(CLAIM_QUERY_PARAM) === '1' ||
        Boolean(sessionStorage.getItem(CLAIM_SESSION_KEY));
}

export async function collectClaimablePointsAndContinue(): Promise<number> {
    const returnUrl = getClaimFlowReturnUrl();
    const startedAt = Date.now();
    let lastClaimAt = startedAt;
    let triggeredCount = 0;
    let emptyScans = 0;

    while (triggeredCount < MAX_CLAIM_CLICKS && Date.now() - startedAt < CLAIM_SCAN_TIMEOUT_MS) {
        const control = findClaimableControl();
        if (!control) {
            emptyScans++;
            const now = Date.now();
            if (emptyScans >= 2 &&
                now - startedAt >= MIN_CLAIM_SCAN_MS &&
                now - lastClaimAt >= POST_CLAIM_SETTLE_MS) {
                break;
            }
            await sleep(CLAIM_SCAN_INTERVAL_MS);
            continue;
        }

        emptyScans = 0;
        console.log(`[RewardsHelper] 领取 Dashboard 可领取积分: ${getElementLabels(control)[0] || 'claim'}`);
        clickClaimControl(control);
        triggeredCount++;
        lastClaimAt = Date.now();
        await sleep(CLAIM_SCAN_INTERVAL_MS);
    }

    console.log(`[RewardsHelper] Dashboard 检查完成，共触发 ${triggeredCount} 个领取操作`);
    sessionStorage.removeItem(CLAIM_SESSION_KEY);

    if (isSafeReturnUrl(returnUrl)) {
        const nextUrl = new URL(returnUrl);
        nextUrl.searchParams.set(CLAIM_CHECKED_PARAM, '1');
        window.location.replace(nextUrl.toString());
    }
    return triggeredCount;
}
