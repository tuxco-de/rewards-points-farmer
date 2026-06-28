// @ts-nocheck
import { config } from './config';

const STORAGE_KEY = 'bing_rewards_auto_searcher_state';

class StateStore { [key: string]: any;
    constructor() {
        this.isSearching = false;
        this.usedSearchTerms = [];
        this.mainPageSearchTerms = [];
        this.iframeSearchTerms = [];
        this.dynamicSearchTerms = [];
        this.countdownTimer = null;
        
        this.currentProgress = {
            current: 0,
            total: 0,
            completed: false,
            noProgressCount: 0
        };

        this.searchState = {
            currentAction: 'idle',
            countdown: 0,
            needRest: false,
            isCollapsed: true,
            dailyTasksQueue: []
        };
    }

    saveState() {
        const state = {
            isSearching: this.isSearching,
            currentProgress: this.currentProgress,
            usedSearchTerms: this.usedSearchTerms,
            searchStartTime: Date.now(),
            lastActivityTime: Date.now(),
            mainPageSearchTerms: this.mainPageSearchTerms,
            iframeSearchTerms: this.iframeSearchTerms,
            dailyTasksQueue: this.searchState.dailyTasksQueue,
            timestamp: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log('状态已保存到本地存储');
        } catch (e) {
            console.log('保存状态失败:', e.message);
        }
    }

    loadState() {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (savedState) {
                const state = JSON.parse(savedState);
                const timeSinceLastActivity = Date.now() - (state.lastActivityTime || 0);
                const maxInactiveTime = 5 * 60 * 1000;

                if (timeSinceLastActivity > maxInactiveTime) {
                    console.log('状态已过期，清除本地存储');
                    this.clearState();
                    return null;
                }

                console.log('从本地存储加载状态:', state);
                if (state.dailyTasksQueue) {
                    this.searchState.dailyTasksQueue = state.dailyTasksQueue;
                }
                return state;
            }
        } catch (e) {
            console.log('加载状态失败:', e.message);
        }
        return null;
    }

    clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('已清除本地存储状态');
        } catch (e) {
            console.log('清除状态失败:', e.message);
        }
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem('bing_rewards_config');
            if (saved) {
                const c = JSON.parse(saved);
                if (c.restTime) config.restTime = c.restTime;
                if (c.scrollTime) config.scrollTime = c.scrollTime;
                if (c.waitTime) config.waitTime = c.waitTime;
                if (c.maxNoProgressCount) config.maxNoProgressCount = c.maxNoProgressCount;
                if (c.isCollapsed !== undefined) this.searchState.isCollapsed = c.isCollapsed;
            }
        } catch (e) { /* ignore */ }
    }
}

export const store = new StateStore();
