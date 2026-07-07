import { config } from './config';
import { store, sleep, getRandomInterval } from './state';
import { createUI, applyCollapseState, applyTheme, updateStatus, showCompletionNotification, setSearchButtonState, updateProgressUI } from './ui';
import { openRewardsSidebarAsync, closeRewardsSidebarAsync, waitForElement, waitForIframeContent } from './dom';
import { getDataFromPanel, getSearchTermsFromMainDoc } from './parser';
import { countdownAsync, simulateScrollingAsync, searchLoop, stopAutomatedSearch, performSearch, startAutomatedSearch, getSearchTerm } from './search';
import { simulateTypingAndSearch } from './dom';
import { t } from './i18n';

declare global {
    interface Window {
        startRewardsTask: () => void;
        stopRewardsTask: () => void;
        __e2e_performSearch: () => Promise<void>;
        __e2e_simulateTypingAndSearch: (term: string) => Promise<boolean>;
        __e2e_getSearchTerm: () => string;
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

        setTimeout(async () => {
            const hasUnfinishedTasks = store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0;
            if (!store.currentProgress.completed || hasUnfinishedTasks) {
                console.log('恢复搜索状态，继续之前的搜索任务');
                
                setSearchButtonState('searching');
                
                if (!store.isSearching) return;
                await simulateScrollingAsync();
                
                if (!store.isSearching) return;
                updateStatus(t('status', 'checkingProgress'));
                store.searchState.currentAction = 'checking';
                
                if (await openRewardsSidebarAsync()) {
                    await waitForIframeContent(10000);
                    getDataFromPanel();
                    getSearchTermsFromMainDoc();
                    
                    await closeRewardsSidebarAsync();
                    
                    if (store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0) {
                        updateStatus(t('status', 'executingPanel'));
                        setTimeout(searchLoop, 1000);
                        return;
                    }
                    
                    const hasUnfinishedDailyTasks = store.dailyTasksData && store.dailyTasksData.some(t => t.status === '未完成');
                    if (store.currentProgress.completed && !hasUnfinishedDailyTasks) {
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
                        updateStatus(t('status', 'restFinished'));
                        await sleep(1000);
                    }
                } else {
                    updateStatus(t('status', 'failedSidebarCheck'));
                }
                
                if (!store.isSearching) return;
                updateStatus(t('status', 'waitingNext'));
                const waitMs = getRandomInterval();
                await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
                
                if (store.isSearching) {
                    searchLoop();
                }
            } else {
                updateStatus(t('status', 'prevCompleted'));
                store.clearState();
            }
        }, 3000);

        return true;
    }
    return false;
}

window.addEventListener('beforeunload', () => {
    if (store.isSearching) {
        store.saveState();
    }
});

// skip running inside iframes (e.g. rewards sidebar)
if (window === window.top) {
    window.addEventListener('load', function () {
        console.log('Rewards Points Farmer 已加载');
        store.loadConfig();
        createUI();
        applyCollapseState();

        window.startRewardsTask = startAutomatedSearch;
        window.stopRewardsTask = stopAutomatedSearch;
        window.__e2e_performSearch = performSearch;
        window.__e2e_simulateTypingAndSearch = simulateTypingAndSearch;
        window.__e2e_getSearchTerm = getSearchTerm;

        const observer = new MutationObserver(() => applyTheme());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-darkmode'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

        setTimeout(() => {
            const restored = restoreState();
            if (!restored) {
                setTimeout(() => {
                    const getRewardsDataAsync = async () => {
                        if (await openRewardsSidebarAsync()) {
                            await waitForIframeContent(10000);
                            getDataFromPanel();
                            getSearchTermsFromMainDoc();
                            await closeRewardsSidebarAsync();
                        } else {
                            getSearchTermsFromMainDoc();
                        }
                    };
                    getRewardsDataAsync();
                }, 1000);
            }
        }, 1000);
    });
}
