import { config } from './config';
import { DailyTask, getDailyTaskSearchTerm, markDailyTaskSkipped, MAX_DAILY_TASK_ATTEMPTS, MAX_PANEL_FAILURES, MAX_REST_CYCLES, MAX_TOTAL_SEARCH_ATTEMPTS, recordDailyTaskAttempt, store, sleep, getRandomInterval } from './state';
import { updateStatus, updateCountdown, showCompletionNotification, setSearchButtonState, updateDailyTasksUI, updateProgressUI } from './ui';
import { simulateMouseInteraction, openRewardsSidebarAsync, closeRewardsSidebarAsync, getRewardsFlyoutIframe, waitForIframeContent, simulateTypingAndSearch, SEARCH_RESULT_SELECTOR } from './dom';
import { getDataFromPanel, getSearchTermsFromMainDoc, fetchOrganicSearchTerms, clickTaskCardAsync } from './parser';
import { t } from './i18n';
import { isDedicatedWorkerContext } from './worker';
import { buildBingSearchUrl, normalizeBingTaskUrl } from './navigation';

let activeCountdownResolve: (() => void) | null = null;

function cancelActiveCountdown() {
    if (store.countdownTimer) {
        clearInterval(store.countdownTimer);
        store.countdownTimer = null;
    }

    const resolve = activeCountdownResolve;
    activeCountdownResolve = null;
    resolve?.();
}

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
    cancelActiveCountdown();

    return new Promise(resolve => {
        store.searchState.currentAction = action;
        store.searchState.countdown = seconds;

        updateCountdown(seconds, action);

        let timerId: ReturnType<typeof setInterval> | null = null;
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;

            if (timerId) clearInterval(timerId);
            if (store.countdownTimer === timerId) store.countdownTimer = null;
            if (activeCountdownResolve === finish) activeCountdownResolve = null;
            resolve();
        };

        activeCountdownResolve = finish;

        if (seconds <= 0 || !store.isSearching) {
            finish();
            return;
        }

        timerId = setInterval(() => {
            if (!store.isSearching) {
                finish();
                return;
            }

            store.searchState.countdown--;
            updateCountdown(store.searchState.countdown, action);

            if (store.searchState.countdown <= 0) {
                finish();
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
export type SearchExecutionResult = 'navigating' | 'same-page' | 'skipped' | 'stopped';

export function getExecutionPhase(): ExecutionPhase {
    if (!store.currentProgress.completed) return 'points';

    const hasQueuedCards = store.searchState.dailyTasksQueue.length > 0;
    if (hasQueuedCards || !store.searchState.panelParsed) return 'cards';
    return 'complete';
}

function getActiveDailyTaskForSearch(): DailyTask | null {
    if (getExecutionPhase() !== 'cards') return null;
    const task = store.searchState.dailyTasksQueue[0];
    if (!task || task.kind !== 'search-promotion' || task.attempts <= 0 || task.searchTerms.length === 0) return null;
    return task;
}

export function getSearchTerm(task: DailyTask | null = getActiveDailyTaskForSearch()) {
    let term = '';

    if (task?.kind === 'search-promotion') {
        term = getDailyTaskSearchTerm(task);
        if (!term) {
            console.warn(`[RewardsHelper] 搜索推广卡 "${task.title}" 的固定词汇已用完`);
            return '';
        }
        console.log(`使用搜索推广卡固定词汇: ${term}`);
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

function skipDailyTask(task: DailyTask) {
    markDailyTaskSkipped(task);
    updateProgressUI();
    updateDailyTasksUI(store.dailyTasksData);
    store.saveState();
}

async function runQueuedDailyTaskFromOpenPanel(): Promise<'clicked' | 'search' | 'skipped' | 'none'> {
    const task = store.searchState.dailyTasksQueue[0];
    if (!task) return 'none';

    const maxAttempts = task.kind === 'search-promotion'
        ? task.searchTerms.length + 1
        : MAX_DAILY_TASK_ATTEMPTS;
    if (task.attempts >= maxAttempts) {
        console.log(`[RewardsHelper] 任务 "${task.title}" 已达到最大尝试次数，跳过`);
        skipDailyTask(task);
        return 'skipped';
    }

    if (task.attempts === 0 && task.url) {
        const taskClicked = await clickTaskCardAsync(task);
        recordDailyTaskAttempt(task);
        store.saveState();
        if (taskClicked) {
            return 'clicked';
        }
    }

    if (task.kind === 'search-promotion') {
        const nextSearchTermIndex = Math.max(0, task.attempts - 1);
        if (nextSearchTermIndex < task.searchTerms.length) {
            return 'search';
        }
        skipDailyTask(task);
        return 'skipped';
    }

    if (task.url) {
        recordDailyTaskAttempt(task);
        store.saveState();
        window.location.href = normalizeBingTaskUrl(task.url);
        return 'clicked';
    }

    skipDailyTask(task);
    return 'skipped';
}

export function stopAutomatedSearch(finalStatus?: string, preserveProgress = false) {
    cancelActiveCountdown();

    store.resetRuntimeState(preserveProgress);
    updateCountdown(0, '');

    if (preserveProgress) store.saveState();
    else store.clearState();
    updateProgressUI();
    updateDailyTasksUI(store.dailyTasksData);
    setSearchButtonState('idle');
    updateStatus(finalStatus || t('status', 'searchStopped'));
}

export async function performSearch(task?: DailyTask | null): Promise<SearchExecutionResult> {
    if (!isDedicatedWorkerContext() || !store.isSearching) return 'stopped';
    if (store.searchState.totalSearchAttempts >= MAX_TOTAL_SEARCH_ATTEMPTS) {
        stopAutomatedSearch(t('status', 'safetyStopped', MAX_TOTAL_SEARCH_ATTEMPTS));
        return 'stopped';
    }
    
    const activeTask = getExecutionPhase() === 'cards' ? (task || getActiveDailyTaskForSearch()) : null;
    if (!activeTask) {
        await ensureFallbackSearchTerms();
    }
    const searchTerm = getSearchTerm(activeTask);
    if (!searchTerm) {
        if (activeTask) skipDailyTask(activeTask);
        else store.saveState();
        return 'skipped';
    }
    if (activeTask) {
        recordDailyTaskAttempt(activeTask);
    }
    store.searchState.totalSearchAttempts++;
    
    updateStatus(t('status', 'searching', searchTerm));
    store.saveState();
    
    const searchUrl = buildBingSearchUrl(searchTerm);

    if (getRewardsFlyoutIframe()) {
        console.log('[RewardsHelper] Rewards 浮层仍处于打开状态，使用单次 URL 跳转避免 Bing React SPA 冲突');
        window.location.href = searchUrl;
        return 'navigating';
    }
    
    const typingSuccess = await simulateTypingAndSearch(searchTerm);
    if (typingSuccess) {
        let isUnloading = false;
        const markUnloading = () => { isUnloading = true; };
        window.addEventListener('beforeunload', markUnloading, { once: true });

        await sleep(5000);
        window.removeEventListener('beforeunload', markUnloading);

        if (isUnloading) {
            console.log('[RewardsHelper] 模拟提交后页面已正常触发跳转');
            return 'navigating';
        }

        const currentQ = (new URLSearchParams(window.location.search).get('q') || '').toLowerCase();
        if (currentQ === searchTerm.toLowerCase()) {
            console.log('[RewardsHelper] 模拟提交已在当前页面完成更新，无需重复跳转');
            return 'same-page';
        }
        console.log('[RewardsHelper] 模拟提交后页面未发生跳转或更新，使用 fallback 跳转');
    }
    
    window.location.href = searchUrl;
    return 'navigating';
}

export async function searchLoop() {
    if (!isDedicatedWorkerContext()) return;
    while (isDedicatedWorkerContext() && store.isSearching) {
        updateStatus(t('status', 'waitingProgress'));
        store.searchState.currentAction = 'checking';
        
        if (await openRewardsSidebarAsync()) {
            await waitForIframeContent(10000);
            const panelParsed = getDataFromPanel();
            getSearchTermsFromMainDoc();

            if (!panelParsed || !store.searchState.panelParsed) {
                store.searchState.panelFailureCount++;
                store.saveState();
                await closeRewardsSidebarAsync();
                if (store.searchState.panelFailureCount >= MAX_PANEL_FAILURES) {
                    stopAutomatedSearch(t('status', 'panelFailuresStopped', MAX_PANEL_FAILURES), true);
                    return;
                }
                updateStatus(t('status', 'waitingPanelRetry'));
                const backoffFactor = 1 + (store.searchState.panelFailureCount - 1) * 0.5;
                const retryInterval = Math.floor((getRandomInterval() * backoffFactor) / 1000);
                await countdownAsync(retryInterval, 'waiting');
                continue;
            }
            
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
                const searchResult = await performSearch(store.searchState.dailyTasksQueue[0]);
                if (!store.isSearching || searchResult === 'stopped') return;
                if (searchResult === 'navigating') return;
                await sleep(500);
                continue;
            }

            if (queuedTaskAction === 'skipped') {
                if (getExecutionPhase() === 'complete') {
                    showCompletionNotification();
                    stopAutomatedSearch(t('status', 'allCompleted'), true);
                    return;
                }
                updateStatus(t('status', 'skippedTaskContinuing'));
                await sleep(100);
                continue;
            }
            
            if (executionPhase === 'complete') {
                showCompletionNotification();
                stopAutomatedSearch(t('status', 'allCompleted'), true);
                return;
            }
            
            if (store.searchState.needRest) {
                store.searchState.needRest = false;
                store.currentProgress.noProgressCount = 0;
                store.searchState.restCycles++;
                if (store.searchState.restCycles > MAX_REST_CYCLES) {
                    stopAutomatedSearch(t('status', 'repeatedNoProgressStopped', MAX_REST_CYCLES), true);
                    return;
                }
                updateStatus(t('status', 'resting', config.maxNoProgressCount, config.restTime / 60));
                await countdownAsync(config.restTime, 'resting');
                if (!store.isSearching) return;
                updateStatus(t('status', 'restFinished'));
                await sleep(1000);
                continue;
            }
        } else {
            store.searchState.panelFailureCount++;
            store.saveState();
            if (store.searchState.panelFailureCount >= MAX_PANEL_FAILURES) {
                stopAutomatedSearch(t('status', 'panelFailuresStopped', MAX_PANEL_FAILURES), true);
                return;
            }
            updateStatus(t('status', 'failedSidebarDirect'));
        }
        
        if (!store.isSearching) return;
        
        const phase = getExecutionPhase();
        if (phase === 'cards' && !store.searchState.panelParsed) {
            updateStatus(t('status', 'waitingPanelRetry'));
            await countdownAsync(Math.floor(getRandomInterval() / 1000), 'waiting');
            continue;
        }

        updateStatus(phase === 'points' ? t('status', 'pointsFirst') : t('status', 'waitingNext'));
        const waitMs = getRandomInterval();
        await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
        
        if (store.isSearching) {
            const searchResult = await performSearch();
            if (!store.isSearching || searchResult === 'stopped') return;
            if (searchResult === 'navigating') return;
            await sleep(500);
            continue;
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
    store.searchState.panelFailureCount = 0;
    store.currentProgress.noProgressCount = 0;
    store.usedSearchTerms = [];
    
    setSearchButtonState('searching');
    updateStatus(t('status', 'autoStarted'));
    store.saveState();
    
    await searchLoop();
}
