import { countdownAsync, getExecutionPhase } from '../../src/search';
import { getDailyTaskKey, markDailyTaskSkipped, store, upsertDailyTask, type DailyTask } from '../../src/state';

describe('task execution state machine', () => {
    beforeEach(() => {
        store.resetRuntimeState();
    });

    afterEach(() => {
        jest.useRealTimers();
        store.resetRuntimeState();
    });

    test('waits for an initial panel parse before declaring completion', () => {
        store.currentProgress.completed = true;
        expect(getExecutionPhase()).toBe('cards');

        store.searchState.panelParsed = true;
        expect(getExecutionPhase()).toBe('complete');
    });

    test('keeps points search ahead of queued card tasks while daily progress is incomplete', () => {
        store.currentProgress.current = 35;
        store.currentProgress.total = 200;
        store.currentProgress.completed = false;
        store.searchState.panelParsed = true;
        store.searchState.dailyTasksQueue = [{
            url: '/search?q=recipe',
            title: '学习新食谱',
            status: '未完成',
            points: 10,
            kind: 'search-promotion',
            searchTerms: ['西红柿炒蛋'],
            attempts: 0,
            source: 'card'
        }];

        expect(getExecutionPhase()).toBe('points');
    });

    test('resolves the previous countdown when a new countdown replaces it', async () => {
        jest.useFakeTimers();
        store.isSearching = true;

        const previousCountdown = countdownAsync(10, 'waiting');
        let previousResolved = false;
        void previousCountdown.then(() => {
            previousResolved = true;
        });

        const replacementCountdown = countdownAsync(2, 'waiting');
        await Promise.resolve();

        expect(previousResolved).toBe(true);
        expect(store.searchState.countdown).toBe(2);

        jest.advanceTimersByTime(2_000);
        await expect(replacementCountdown).resolves.toBeUndefined();
        expect(store.countdownTimer).toBeNull();
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

    test('keeps card tasks with the same URL but different titles', () => {
        const sharedUrl = 'https://www.bing.com/?form=ML2PCR';
        const createTask = (title: string): DailyTask => ({
            url: sharedUrl,
            title,
            status: '未完成',
            points: 10,
            kind: 'search-promotion',
            searchTerms: [title],
            attempts: 0,
            source: 'card'
        });
        const bankTask = createTask('更智能的银行服务\u200B');
        const concertTask = createTask('观看演出');

        expect(upsertDailyTask(bankTask)).toBe(true);
        expect(upsertDailyTask(concertTask)).toBe(true);
        expect(store.searchState.dailyTasksQueue).toHaveLength(2);
        expect(getDailyTaskKey(bankTask)).not.toBe(getDailyTaskKey(concertTask));
        expect(store.searchState.dailyTasksQueue[0].title).toBe('更智能的银行服务');
    });

    test('migrates a legacy URL-only queue item to the title-aware card key', () => {
        const legacyTask: DailyTask = {
            url: '/rewards/task/nasa-artemis',
            title: 'NASA Artemis mission',
            status: '未完成',
            points: 10,
            kind: 'search-promotion',
            searchTerms: ['stale browser term'],
            attempts: 0
        };

        expect(upsertDailyTask(legacyTask)).toBe(true);
        expect(store.searchState.dailyTasksQueue[0].source).toBe('card');
        expect(getDailyTaskKey(store.searchState.dailyTasksQueue[0])).toContain('card:nasa artemis mission|');
    });
});
