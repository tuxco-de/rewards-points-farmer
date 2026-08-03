import { getExecutionPhase } from '../../src/search';
import { markDailyTaskSkipped, store, type DailyTask } from '../../src/state';

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

    test('marks a skipped queue item as skipped in the persisted UI data', () => {
        const task: DailyTask = {
            url: '/search?q=ocean-life-films',
            title: 'Ocean life films',
            status: '未完成',
            points: 10,
            kind: 'search-promotion',
            searchTerms: ['Ocean life films'],
            attempts: 2,
        };
        store.searchState.dailyTasksQueue = [task];
        store.dailyTasksData = [{ name: task.title, status: '未完成' }];

        markDailyTaskSkipped(task);

        expect(store.searchState.dailyTasksQueue).toEqual([]);
        expect(store.searchState.attemptedTasks).toContain(task.url);
        expect(store.dailyTasksData).toEqual([{ name: task.title, status: '已跳过' }]);
    });
});
