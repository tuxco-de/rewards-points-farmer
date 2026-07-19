import { config } from './config';
import { DailyTask, getDailyTaskSearchTerm, markDailyTaskSkipped, MAX_DAILY_TASK_ATTEMPTS, recordDailyTaskAttempt, store, sleep, getRandomInterval } from './state';
import { updateStatus, updateCountdown, showCompletionNotification, setSearchButtonState } from './ui';
import { simulateMouseInteraction, openRewardsSidebarAsync, closeRewardsSidebarAsync, waitForIframeContent, simulateTypingAndSearch, SEARCH_RESULT_SELECTOR } from './dom';
import { getDataFromPanel, getSearchTermsFromMainDoc, fetchOrganicSearchTerms, clickTaskCardAsync } from './parser';
import { t } from './i18n';
import { isDedicatedWorkerContext } from './worker';

export async function simulateScrollingAsync() {
    updateStatus(t('status', 'browsing'));
    store.searchState.currentAction = 'scrolling';
    
    for (let i = 0; i < 3; i++) {
        const results = document.querySelectorAll(SEARCH_RESULT_SELECTOR);
        if (results.length > 0) {
            const randomResult = results[Math.floor(Math.random() * results.length)];
            await simulateMouseInteraction(randomResult);
        }
        
        window.scrollBy({
            top: window.innerHeight * (0.3 + Math.random() * 0.4),
            behavior: 'smooth'
        });
        
        const scrollWait = Math.floor(config.scrollTime / 3) * 1000;
        await countdownAsync(scrollWait / 1000, 'scrolling');
        if (!store.isSearching) break;
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function countdownAsync(seconds: number, action: string): Promise<void> {
    return new Promise(resolve => {
        if (store.countdownTimer) {
            clearInterval(store.countdownTimer);
            store.countdownTimer = null;
        }

        store.searchState.currentAction = action;
        store.searchState.countdown = seconds;

        updateCountdown(seconds, action);

        const timerId = setInterval(() => {
            if (!store.isSearching) {
                clearInterval(timerId);
                store.countdownTimer = null;
                resolve();
                return;
            }

            store.searchState.countdown--;
            updateCountdown(store.searchState.countdown, action);

            if (store.searchState.countdown <= 0) {
                clearInterval(timerId);
                store.countdownTimer = null;
                resolve();
            }
        }, 1000);

        store.countdownTimer = timerId;
    });
}

export async function ensureFallbackSearchTerms() {
    if (!store.dynamicSearchTerms || store.dynamicSearchTerms.length < 10) {
        console.log('[RewardsHelper] 动态词库不足，尝试获取新词库...');
        const newTerms = await fetchOrganicSearchTerms();
        if (newTerms.length > 0) {
            store.dynamicSearchTerms = [...newTerms, ...store.dynamicSearchTerms];
            store.dynamicSearchTerms = [...new Set(store.dynamicSearchTerms)]; // deduplicate
        }
    }
}

export type ExecutionPhase = 'points' | 'cards' | 'complete';

export function getExecutionPhase(): ExecutionPhase {
    if (!store.currentProgress.completed) return 'points';

    const hasQueuedCards = store.searchState.dailyTasksQueue.length > 0;
    const hasUnfinishedCards = store.dailyTasksData.some(task => task.status === '未完成');
    return hasQueuedCards || hasUnfinishedCards ? 'cards' : 'complete';
}

function getActiveDailyTaskForSearch(): DailyTask | null {
    if (getExecutionPhase() !== 'cards') return null;
    const task = store.searchState.dailyTasksQueue[0];
    if (!task || task.attempts <= 0 || task.queryCandidates.length === 0) return null;
    return task;
}

export function getSearchTerm(task: DailyTask | null = getActiveDailyTaskForSearch()) {
    let term = '';

    if (task && task.queryCandidates.length > 0) {
        term = getDailyTaskSearchTerm(task);
        console.log(`使用卡片任务相关词汇: ${term}`);
    }
    
    if (!term && store.iframeSearchTerms && store.iframeSearchTerms.length > 0) {
        let attempts = 0;
        while (attempts < store.iframeSearchTerms.length) {
            const index = Math.floor(Math.random() * store.iframeSearchTerms.length);
            const candidate = store.iframeSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                console.log(`使用侧边栏词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }
    
    if (!term && store.mainPageSearchTerms && store.mainPageSearchTerms.length > 0) {
        let attempts = 0;
        while (attempts < store.mainPageSearchTerms.length) {
            const index = Math.floor(Math.random() * store.mainPageSearchTerms.length);
            const candidate = store.mainPageSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                console.log(`使用主页面词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }

    if (!term && store.dynamicSearchTerms && store.dynamicSearchTerms.length > 0) {
        let attempts = 0;
        while (attempts < store.dynamicSearchTerms.length) {
            const index = Math.floor(Math.random() * store.dynamicSearchTerms.length);
            const candidate = store.dynamicSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                store.dynamicSearchTerms.splice(index, 1);
                console.log(`使用动态词库词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }

    if (!term) {
        let attempts = 0;
        while (attempts < 50) {
            const index = Math.floor(Math.random() * store.fallbackSearchTerms.length);
            const candidate = store.fallbackSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                console.log(`使用后备词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }

    if (!term) {
        term = `Search ${Math.floor(Math.random() * 10000)} ${Date.now().toString().slice(-4)}`;
        console.log(`使用随机生成词汇: ${term}`);
    }

    if (!store.usedSearchTerms.includes(term)) {
        store.usedSearchTerms.push(term);
    }
    return term;
}

async function runQueuedDailyTaskFromOpenPanel(): Promise<'clicked' | 'search' | 'skipped' | 'none'> {
    const task = store.searchState.dailyTasksQueue[0];
    if (!task) return 'none';

    if (task.attempts >= MAX_DAILY_TASK_ATTEMPTS) {
        console.log(`[RewardsHelper] 任务 "${task.title}" 已达到最大尝试次数，跳过`);
        markDailyTaskSkipped(task);
        store.saveState();
        return 'skipped';
    }

    if (task.attempts === 0 && task.url) {
        const taskClicked = await clickTaskCardAsync(task);
        if (taskClicked) {
            recordDailyTaskAttempt(task);
            store.saveState();
            return 'clicked';
        }
    }

    if (task.queryCandidates.length > 0) {
        return 'search';
    }

    if (task.url) {
        recordDailyTaskAttempt(task);
        store.saveState();
        window.location.href = task.url;
        return 'clicked';
    }

    markDailyTaskSkipped(task);
    store.saveState();
    return 'skipped';
}

export function stopAutomatedSearch() {
    if (store.countdownTimer) {
        clearInterval(store.countdownTimer);
        store.countdownTimer = null;
    }

    store.isSearching = false;
    store.searchState.currentAction = 'idle';
    store.searchState.needRest = false;
    store.searchState.dailyTasksQueue = [];
    store.searchState.attemptedTasks = [];
    store.saveState();
    store.currentProgress.noProgressCount = 0;
    store.usedSearchTerms = [];
    updateCountdown(0, '');

    store.clearState();
    setSearchButtonState('idle');
    updateStatus(t('status', 'searchStopped'));
}

export async function performSearch(task?: DailyTask | null) {
    if (!isDedicatedWorkerContext() || !store.isSearching) return;
    
    const activeTask = getExecutionPhase() === 'cards' ? (task || getActiveDailyTaskForSearch()) : null;
    if (!activeTask) {
        await ensureFallbackSearchTerms();
    }
    const searchTerm = getSearchTerm(activeTask);
    if (activeTask) {
        recordDailyTaskAttempt(activeTask);
    }
    
    updateStatus(t('status', 'searching', searchTerm));
    store.saveState();
    
    const searchUrl = new URL(window.location.href);
    if (searchUrl.protocol === 'http:' || searchUrl.protocol === 'https:') searchUrl.pathname = '/search';
    searchUrl.search = '';
    searchUrl.hash = '';
    searchUrl.searchParams.set('q', searchTerm);
    
    const typingSuccess = await simulateTypingAndSearch(searchTerm);
    if (typingSuccess) {
        // Wait up to 5 seconds for page navigation to happen naturally
        await sleep(5000);
        console.log('[RewardsHelper] 模拟提交后页面未发生跳转，使用 fallback 跳转');
    }
    
    window.location.href = searchUrl.toString();
}

export async function searchLoop() {
    if (!isDedicatedWorkerContext()) return;
    while (isDedicatedWorkerContext() && store.isSearching && !store.searchState.needRest) {
        updateStatus(t('status', 'waitingProgress'));
        store.searchState.currentAction = 'checking';
        
        if (await openRewardsSidebarAsync()) {
            await waitForIframeContent(10000);
            getDataFromPanel();
            getSearchTermsFromMainDoc();
            
            const executionPhase = getExecutionPhase();
            let queuedTaskAction: 'clicked' | 'search' | 'skipped' | 'none' = 'none';
            if (executionPhase === 'cards' && store.searchState.dailyTasksQueue.length > 0) {
                queuedTaskAction = await runQueuedDailyTaskFromOpenPanel();
            }
            
            await closeRewardsSidebarAsync();
            
            if (queuedTaskAction === 'clicked') {
                updateStatus(t('status', 'executingPanel'));
                await countdownAsync(3, 'waiting');
                continue;
            }

            if (queuedTaskAction === 'search') {
                updateStatus(t('status', 'executingPanel'));
                await countdownAsync(2, 'waiting');
                performSearch(store.searchState.dailyTasksQueue[0]);
                return;
            }

            if (queuedTaskAction === 'skipped') {
                continue;
            }
            
            if (executionPhase === 'complete') {
                showCompletionNotification();
                updateStatus(t('status', 'allCompleted'));
                stopAutomatedSearch();
                return;
            }
            
            if (store.searchState.needRest) {
                store.searchState.needRest = false;
                store.currentProgress.noProgressCount = 0;
                updateStatus(t('status', 'resting', config.maxNoProgressCount, config.restTime / 60));
                await countdownAsync(config.restTime, 'resting');
                if (!store.isSearching) return;
                updateStatus(t('status', 'restFinished'));
                await sleep(1000);
                continue;
            }
        } else {
            updateStatus(t('status', 'failedSidebarDirect'));
        }
        
        if (!store.isSearching) return;
        
        updateStatus(getExecutionPhase() === 'points' ? t('status', 'pointsFirst') : t('status', 'waitingNext'));
        const waitMs = getRandomInterval();
        await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
        
        if (store.isSearching) {
            performSearch();
            return; // page will navigate, loop ends
        }
    }
}

export async function startAutomatedSearch() {
    if (!isDedicatedWorkerContext()) {
        console.warn('[RewardsHelper] 已阻止非专用任务标签页启动自动搜索');
        return;
    }
    if (getExecutionPhase() === 'complete') {
        updateStatus(t('status', 'alreadyCompleted'));
        return;
    }
    
    console.log('[RewardsHelper] 准备工作就绪，启动后台任务');
    store.isSearching = true;
    store.searchState.needRest = false;
    store.currentProgress.noProgressCount = 0;
    store.usedSearchTerms = [];
    
    setSearchButtonState('searching');
    updateStatus(t('status', 'autoStarted'));
    store.saveState();
    
    searchLoop();
}
