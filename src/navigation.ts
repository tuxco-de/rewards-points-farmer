const BING_HOST_PATTERN = /(^|\.)bing\.com$/i;
const NON_SEARCH_BING_HOSTS = new Set(['rewards.bing.com']);
const LOCALE_QUERY_PARAMS = ['mkt', 'setlang', 'cc', 'ensearch'] as const;

function isHttpUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
}

export function isBingHost(hostname: string): boolean {
    return BING_HOST_PATTERN.test(hostname);
}

export function getBingSearchBaseUrl(baseHref = window.location.href): URL {
    const current = new URL(baseHref);
    if (!isHttpUrl(current)) return current;

    const useCurrentOrigin = isBingHost(current.hostname) &&
        !NON_SEARCH_BING_HOSTS.has(current.hostname.toLowerCase());
    const target = new URL(useCurrentOrigin ? current.origin : 'https://www.bing.com');

    for (const name of LOCALE_QUERY_PARAMS) {
        const value = current.searchParams.get(name);
        if (value) target.searchParams.set(name, value);
    }
    return target;
}

export function buildBingPageUrl(
    pathname: string,
    params: Record<string, string> = {},
    baseHref = window.location.href
): string {
    const current = new URL(baseHref);
    const target = getBingSearchBaseUrl(baseHref);
    if (isHttpUrl(target)) target.pathname = pathname;
    else target.pathname = current.pathname;

    for (const [name, value] of Object.entries(params)) {
        target.searchParams.set(name, value);
    }
    target.hash = '';
    return target.toString();
}

export function normalizeBingTaskUrl(value: string, baseHref = window.location.href): string {
    const current = new URL(baseHref);
    const task = new URL(value, current);
    if (!isHttpUrl(task) || !isBingHost(task.hostname)) return task.toString();

    const target = getBingSearchBaseUrl(baseHref);
    target.pathname = task.pathname;
    target.search = task.search;
    target.hash = task.hash;

    for (const name of LOCALE_QUERY_PARAMS) {
        if (target.searchParams.has(name)) continue;
        const value = current.searchParams.get(name);
        if (value) target.searchParams.set(name, value);
    }
    return target.toString();
}
