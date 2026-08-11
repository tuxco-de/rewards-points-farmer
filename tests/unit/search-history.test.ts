import {
    DAILY_SEARCH_HISTORY_KEY,
    hasUsedSearchTerm,
    loadDailySearchHistory,
    rememberSearchTerm,
    saveDailySearchHistory,
    store
} from '../../src/state';

describe('daily search history', () => {
    beforeEach(() => {
        localStorage.clear();
        store.resetRuntimeState();
    });

    afterEach(() => {
        localStorage.clear();
        store.resetRuntimeState();
    });

    test('persists unique terms independently from runtime state', () => {
        rememberSearchTerm('Solar eclipse 2026');
        rememberSearchTerm('  solar   eclipse 2026  ');

        expect(store.usedSearchTerms).toEqual(['Solar eclipse 2026']);
        store.resetRuntimeState();
        expect(store.usedSearchTerms).toEqual([]);
        expect(loadDailySearchHistory()).toEqual(['Solar eclipse 2026']);
    });

    test('expires history on the next local calendar day', () => {
        saveDailySearchHistory(['today term'], new Date(2026, 7, 11, 23, 59));

        expect(loadDailySearchHistory(new Date(2026, 7, 11, 23, 59))).toEqual(['today term']);
        expect(loadDailySearchHistory(new Date(2026, 7, 12, 0, 1))).toEqual([]);
        expect(localStorage.getItem(DAILY_SEARCH_HISTORY_KEY)).toBeNull();
    });

    test('matches used terms case-insensitively after whitespace normalization', () => {
        expect(hasUsedSearchTerm('  BREAKING   NEWS ', ['breaking news'])).toBe(true);
        expect(hasUsedSearchTerm('different news', ['breaking news'])).toBe(false);
    });
});
