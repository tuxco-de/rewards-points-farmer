import {
    getTopOrganicSearchResults,
    maybeClickTopSearchResult,
    pickTopSearchResult,
    SEARCH_CREDIT_SETTLE_SECONDS,
    SEARCH_RESULT_CLICK_PROBABILITY,
    shouldClickSearchResult,
    shouldUseFullPageSearchNavigation
} from '../../src/search';
import { store } from '../../src/state';

describe('organic search result clicking', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <ol id="b_results">
                <li class="b_ad"><h2><a href="https://ads.example.com">Sponsored</a></h2></li>
                <li class="b_algo"><h2><a href="https://example.com/one">Result one</a></h2></li>
                <li class="b_algo"><h2><a href="https://example.com/two">Result two</a></h2></li>
                <li class="b_algo"><h2><a href="https://example.com/three">Result three</a></h2></li>
                <li class="b_algo"><h2><a href="https://example.com/four">Result four</a></h2></li>
            </ol>`;
        window.history.replaceState({}, '', '/search?q=unit-test-query');
        sessionStorage.clear();
        store.resetRuntimeState();
        store.isSearching = true;
    });

    afterEach(() => {
        store.resetRuntimeState();
        sessionStorage.clear();
    });

    test('keeps only the first three organic results and excludes ads', () => {
        expect(getTopOrganicSearchResults().map(link => link.textContent)).toEqual([
            'Result one',
            'Result two',
            'Result three'
        ]);
    });

    test('uses a 50 percent trigger probability', () => {
        expect(SEARCH_RESULT_CLICK_PROBABILITY).toBe(0.5);
        expect(SEARCH_CREDIT_SETTLE_SECONDS).toBeGreaterThanOrEqual(5);
        expect(shouldClickSearchResult(0.4999)).toBe(true);
        expect(shouldClickSearchResult(0.5)).toBe(false);
    });

    test('uses full-page navigation on Bing and keeps fixture form submission elsewhere', () => {
        expect(shouldUseFullPageSearchNavigation('www.bing.com')).toBe(true);
        expect(shouldUseFullPageSearchNavigation('cn.bing.com')).toBe(true);
        expect(shouldUseFullPageSearchNavigation('localhost')).toBe(false);
    });

    test('weights selection toward the first three results', () => {
        const results = getTopOrganicSearchResults();
        expect(pickTopSearchResult(results, 0.1)?.textContent).toBe('Result one');
        expect(pickTopSearchResult(results, 0.6)?.textContent).toBe('Result two');
        expect(pickTopSearchResult(results, 0.9)?.textContent).toBe('Result three');
    });

    test('clicks at most once for each search query', async () => {
        const clicked: string[] = [];
        document.querySelectorAll<HTMLAnchorElement>('#b_results a').forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                clicked.push((event.currentTarget as HTMLAnchorElement).textContent || '');
            });
        });
        const rolls = [0.49, 0.6];
        const random = () => rolls.shift() ?? 0;

        await expect(maybeClickTopSearchResult(random)).resolves.toBe(true);
        await expect(maybeClickTopSearchResult(() => 0)).resolves.toBe(false);
        expect(clicked).toEqual(['Result two']);
    });
});
