import { getExecutionPhase } from '../../src/search';
import { store } from '../../src/state';

describe('task execution state machine', () => {
    beforeEach(() => {
        store.resetRuntimeState();
    });

    afterEach(() => {
        store.resetRuntimeState();
    });

    test('waits for an initial panel parse before declaring completion', () => {
        store.currentProgress.completed = true;
        expect(getExecutionPhase()).toBe('cards');

        store.searchState.panelParsed = true;
        expect(getExecutionPhase()).toBe('complete');
    });

    test('does not remain in card phase for an already skipped UI card', () => {
        store.currentProgress.completed = true;
        store.searchState.panelParsed = true;
        store.dailyTasksData = [{ name: 'Skipped card', status: '未完成' }];
        store.searchState.dailyTasksQueue = [];

        expect(getExecutionPhase()).toBe('complete');
    });
});
