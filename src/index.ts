import { config } from './config';
import { store, sleep, getRandomInterval } from './state';
import { createUI, applyCollapseState, applyTheme, updateStatus, showCompletionNotification, setSearchButtonState, updateProgressUI } from './ui';
import { openRewardsSidebarAsync, closeRewardsSidebarAsync, waitForElement, waitForIframeContent } from './dom';
import { getDataFromPanel, getSearchTermsFromMainDoc } from './parser';
import { countdownAsync, simulateScrollingAsync, searchLoop, stopAutomatedSearch, performSearch, startAutomatedSearch } from './search';
import { simulateTypingAndSearch } from './dom';
import { t } from './i18n';

declare global {
    interface Window {
        startRewardsTask: () => void;
        stopRewardsTask: () => void;
        __e2e_performSearch: () => Promise<void>;
        __e2e_simulateTypingAndSearch: (term: string) => Promise<boolean>;
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
            if (!store.currentProgress.completed) {
                console.log('恢复搜索状态，继续之前的搜索任务');
                
                setSearchButtonState('searching');
                
                if (!store.isSearching) return;
                await simulateScrollingAsync();
                
                if (store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0) {
                    updateStatus(t('status', 'executingPanel'));
                    await sleep(2000);
                    const nextTaskUrl = store.searchState.dailyTasksQueue.shift();
                    
                    if (nextTaskUrl) {
                        if (!store.searchState.attemptedTasks) store.searchState.attemptedTasks = [];
                        store.searchState.attemptedTasks.push(nextTaskUrl);
                        store.saveState();
                        window.location.href = nextTaskUrl;
                        return;
                    }
                }
                
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
                        const nextTaskUrl = store.searchState.dailyTasksQueue.shift();
                        
                        if (nextTaskUrl) {
                            if (!store.searchState.attemptedTasks) store.searchState.attemptedTasks = [];
                            store.searchState.attemptedTasks.push(nextTaskUrl);
                            store.saveState();
                            window.location.href = nextTaskUrl;
                            return;
                        }
                    }
                    
                    if (store.currentProgress.completed) {
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
