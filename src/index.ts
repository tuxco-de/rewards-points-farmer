import { store, STORAGE_KEY } from './state';
import { createUI, updateStatus, setSearchButtonState, updateProgressUI, updateDailyTasksUI, showToast, openSettingsPanel } from './ui';
import { openRewardsSidebarAsync, closeRewardsSidebarAsync, waitForIframeContent } from './dom';
import { getDataFromPanel, getSearchTermsFromMainDoc } from './parser';
import { searchLoop, stopAutomatedSearch, performSearch, startAutomatedSearch, getSearchTerm, getExecutionPhase, type SearchExecutionResult } from './search';
import { simulateTypingAndSearch } from './dom';
import { t } from './i18n';
import { consumePendingWorkerCommand, initializeDedicatedWorkerContext, isDedicatedWorkerContext, listenForWorkerCommands, requestDedicatedWorkerStart, requestDedicatedWorkerStop } from './worker';
import { checkForUpdates } from './update';
import { collectClaimablePointsAndContinue, isClaimCheckContext } from './claims';

declare const GM_registerMenuCommand: undefined | ((caption: string, onClick: () => void) => string | number);

declare global {
    interface Window {
        startRewardsTask: () => void;
        stopRewardsTask: () => void;
        __e2e_performSearch: () => Promise<SearchExecutionResult>;
        __e2e_simulateTypingAndSearch: (term: string) => Promise<boolean>;
        __e2e_getSearchTerm: () => string;
        __e2e_getExecutionPhase: () => string;
        __e2e_getCurrentProgress: () => unknown;
        __e2e_getParsedSnapshot: () => unknown;
        __e2e_getDailyTaskQueue: () => unknown[];
        __e2e_isDedicatedWorker: () => boolean;
        __e2e_isLocalSearchRunning: () => boolean;
    }
}

let dedicatedWorker = false;
let sharedIsSearching = false;

async function startWorkerSearchSafely() {
    try {
        await startAutomatedSearch();
    } catch (error) {
        console.error('[RewardsHelper] 任务运行失败:', error);
        stopAutomatedSearch(t('status', 'runtimeErrorStopped'), true);
    }
}

function applySharedStateToController(savedState: any) {
    if (!savedState) {
        store.resetRuntimeState();
        sharedIsSearching = false;
        updateProgressUI();
        updateDailyTasksUI([]);
        setSearchButtonState('idle');
        return;
    }

    store.isSearching = false;
    sharedIsSearching = Boolean(savedState?.isSearching);

    if (savedState?.currentProgress) store.currentProgress = savedState.currentProgress;
    if (savedState?.usedSearchTerms) store.usedSearchTerms = savedState.usedSearchTerms;
    if (savedState?.mainPageSearchTerms) store.mainPageSearchTerms = savedState.mainPageSearchTerms;
    if (savedState?.iframeSearchTerms) store.iframeSearchTerms = savedState.iframeSearchTerms;
    if (savedState?.dailyTasksData) store.dailyTasksData = savedState.dailyTasksData;

    updateProgressUI();
    updateDailyTasksUI(store.dailyTasksData);
    setSearchButtonState(sharedIsSearching ? 'searching' : 'idle');
    if (sharedIsSearching) updateStatus(t('status', 'runningInWorker'));
}

function syncControllerState() {
    applySharedStateToController(store.loadState());
}

async function startFromCurrentContext() {
    if (dedicatedWorker) {
        if (!store.isSearching) await startWorkerSearchSafely();
        return;
    }

    if (!requestDedicatedWorkerStart()) {
        showToast(t('status', 'popupBlocked'), 5000);
        updateStatus(t('status', 'popupBlocked'));
        return;
    }

    sharedIsSearching = true;
    setSearchButtonState('searching');
    updateStatus(t('status', 'openingWorker'));
}

function stopFromCurrentContext() {
    if (dedicatedWorker) {
        stopAutomatedSearch();
        return;
    }

    requestDedicatedWorkerStop();
    store.clearState();
    store.resetRuntimeState();
    sharedIsSearching = false;
    updateProgressUI();
    updateDailyTasksUI([]);
    setSearchButtonState('idle');
    updateStatus(t('status', 'stopRequested'));
}

async function toggleSearchFromCurrentContext() {
    const isRunning = dedicatedWorker ? store.isSearching : sharedIsSearching;
    if (isRunning) stopFromCurrentContext();
    else await startFromCurrentContext();
}

function registerUserscriptMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(t('ui', 'menuStart'), () => { void startFromCurrentContext(); });
    GM_registerMenuCommand(t('ui', 'menuStop'), stopFromCurrentContext);
    GM_registerMenuCommand(t('ui', 'menuSettings'), openSettingsPanel);
    GM_registerMenuCommand(t('ui', 'menuCheckUpdates'), () => { void checkForUpdatesAndNotify(); });
}

async function checkForUpdatesAndNotify() {
    try {
        const result = await checkForUpdates();
        showToast(
            result.updateAvailable
                ? t('ui', 'updateAvailable', result.latestVersion)
                : t('ui', 'alreadyLatest', result.currentVersion),
            result.updateAvailable ? 7000 : 3500
        );
    } catch (error) {
        console.warn('[RewardsHelper] 检查更新失败:', error);
        showToast(t('ui', 'updateCheckFailed'), 5000);
    }
}

async function collectRewardsDataInWorker() {
    let panelParsed = false;
    if (await openRewardsSidebarAsync()) {
        await waitForIframeContent(10000);
        panelParsed = getDataFromPanel();
        getSearchTermsFromMainDoc();
        await closeRewardsSidebarAsync();
    } else {
        getSearchTermsFromMainDoc();
    }

    if (!panelParsed) {
        store.dailyTasksData = [];
        updateDailyTasksUI([]);
        console.log('[RewardsHelper] Rewards 侧栏不可用，已使用主搜索页数据完成只读初始化');
    }
}

function restoreState() {
    const savedState = store.loadState();
    if (savedState && savedState.isSearching) {
        store.isSearching = true;
        
        if (savedState.currentProgress) store.currentProgress = savedState.currentProgress;
        if (savedState.usedSearchTerms) store.usedSearchTerms = savedState.usedSearchTerms;
        if (savedState.mainPageSearchTerms) store.mainPageSearchTerms = savedState.mainPageSearchTerms;
        if (savedState.iframeSearchTerms) store.iframeSearchTerms = savedState.iframeSearchTerms;
        
        updateProgressUI();

        updateStatus(t('status', 'detectedPrev'));

        setSearchButtonState('searching');
        setTimeout(() => {
            if (!store.isSearching) return;
            console.log('恢复搜索状态，继续之前的搜索任务');
            void searchLoop().catch(error => {
                console.error('[RewardsHelper] 恢复任务失败:', error);
                stopAutomatedSearch(t('status', 'runtimeErrorStopped'), true);
            });
        }, 3000);

        return true;
    }
    return false;
}

window.addEventListener('beforeunload', () => {
    if (isDedicatedWorkerContext() && store.isSearching) {
        store.saveState();
    }
});

// skip running inside iframes (e.g. rewards sidebar)
if (window === window.top) {
    window.addEventListener('load', async function () {
        console.log('Rewards Points Farmer 已加载');
        if (isClaimCheckContext()) {
            await collectClaimablePointsAndContinue();
            return;
        }
        dedicatedWorker = initializeDedicatedWorkerContext();
        store.loadConfig();
        createUI({
            isWorker: dedicatedWorker,
            onToggleSearch: toggleSearchFromCurrentContext,
            onCheckForUpdates: checkForUpdatesAndNotify
        });
        window.startRewardsTask = () => { void startFromCurrentContext(); };
        window.stopRewardsTask = stopFromCurrentContext;
        window.__e2e_performSearch = performSearch;
        window.__e2e_simulateTypingAndSearch = simulateTypingAndSearch;
        window.__e2e_getSearchTerm = getSearchTerm;
        window.__e2e_getExecutionPhase = getExecutionPhase;
        window.__e2e_getCurrentProgress = () => ({ ...store.currentProgress });
        window.__e2e_getParsedSnapshot = () => ({
            currentProgress: { ...store.currentProgress },
            dailyTasksData: store.dailyTasksData.map(task => ({ ...task })),
            dailyTasksQueue: store.searchState.dailyTasksQueue.map(task => ({
                ...task,
                searchTerms: [...task.searchTerms]
            })),
            mainPageSearchTerms: [...store.mainPageSearchTerms],
            iframeSearchTerms: [...store.iframeSearchTerms]
        });
        window.__e2e_getDailyTaskQueue = () => store.searchState.dailyTasksQueue.map(task => ({
            ...task,
            searchTerms: [...task.searchTerms]
        }));
        window.__e2e_isDedicatedWorker = isDedicatedWorkerContext;
        window.__e2e_isLocalSearchRunning = () => store.isSearching;
        registerUserscriptMenuCommands();

        if (!dedicatedWorker) {
            syncControllerState();
            window.addEventListener('storage', event => {
                if (event.key === STORAGE_KEY) syncControllerState();
            });
        }

        setTimeout(() => {
            if (!dedicatedWorker) {
                getSearchTermsFromMainDoc();
                return;
            }

            const pendingCommand = consumePendingWorkerCommand();
            if (pendingCommand?.action === 'stop') {
                stopAutomatedSearch();
            } else {
                const restored = restoreState();
                if (!restored && pendingCommand?.action === 'start') {
                    void startWorkerSearchSafely();
                } else if (!restored) {
                    void collectRewardsDataInWorker();
                }
            }

            listenForWorkerCommands(command => {
                if (command.action === 'start' && !store.isSearching) {
                    void startWorkerSearchSafely();
                } else if (command.action === 'stop') {
                    stopAutomatedSearch();
                }
            });
        }, 1000);
    });
}
