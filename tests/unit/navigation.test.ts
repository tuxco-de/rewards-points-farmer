import { buildBingPageUrl, normalizeBingTaskUrl } from '../../src/navigation';

describe('Bing navigation', () => {
    test('preserves locale parameters and removes unrelated search parameters', () => {
        const result = new URL(buildBingPageUrl(
            '/search',
            { q: 'custom term' },
            'https://cn.bing.com/search?q=old&mkt=zh-CN&setlang=zh-Hans&form=QBLH'
        ));

        expect(result.origin).toBe('https://cn.bing.com');
        expect(result.pathname).toBe('/search');
        expect(result.searchParams.get('q')).toBe('custom term');
        expect(result.searchParams.get('mkt')).toBe('zh-CN');
        expect(result.searchParams.get('setlang')).toBe('zh-Hans');
        expect(result.searchParams.has('form')).toBe(false);
    });

    test('uses the canonical search host when started from Rewards Dashboard', () => {
        const result = new URL(buildBingPageUrl(
            '/',
            { rewards_helper_worker: '1' },
            'https://rewards.bing.com/dashboard?mkt=en-US'
        ));

        expect(result.origin).toBe('https://www.bing.com');
        expect(result.searchParams.get('mkt')).toBe('en-US');
    });

    test('keeps task navigation on the active search origin', () => {
        const result = new URL(normalizeBingTaskUrl(
            'https://www.bing.com/rewards/task/example',
            'https://cn.bing.com/search?mkt=zh-CN'
        ));

        expect(result.origin).toBe('https://cn.bing.com');
        expect(result.pathname).toBe('/rewards/task/example');
        expect(result.searchParams.get('mkt')).toBe('zh-CN');
    });
});
