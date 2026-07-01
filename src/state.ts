import { config } from './config';

const STORAGE_KEY = 'bing_rewards_auto_searcher_state';
const CONFIG_KEY = 'bing_rewards_config';

class StateStore {
    isSearching: boolean = false;
    usedSearchTerms: string[] = [];
    mainPageSearchTerms: string[] = [];
    iframeSearchTerms: string[] = [];
    dynamicSearchTerms: string[] = [];
    fallbackSearchTerms: string[] = [
        "iPhone", "Tesla", "NVIDIA", "Microsoft", "weather", "news today",
        "best movies", "recipe", "travel", "technology", "sports scores",
        "stock market", "music playlist", "fitness tips", "book reviews",
        "ChatGPT", "AI", "Machine Learning", "Python programming", "JavaScript tutorial",
        "healthy diet", "weight loss", "yoga poses", "meditation guide", "mental health",
        "how to cook steak", "easy dinner ideas", "vegan recipes", "baking bread", "coffee brewing",
        "top PC games", "PS5 exclusive", "Xbox Game Pass", "Nintendo Switch", "gaming monitor",
        "latest smartphones", "best laptop 2024", "smart home devices", "wireless earbuds", "4K TV",
        "dog breeds", "cat care", "aquarium setup", "pet training", "bird watching",
        "electric cars", "hybrid vehicles", "car maintenance", "motorcycle gear", "road trip ideas",
        "home decor", "DIY projects", "gardening tips", "indoor plants", "minimalist living",
        "personal finance", "investing for beginners", "crypto news", "credit score", "budgeting apps",
        "workout routine", "home gym", "running shoes", "cycling routes", "swimming techniques",
        "photography tips", "video editing software", "graphic design trends", "digital art", "drawing tutorials",
        "learning languages", "history facts", "science news", "space exploration", "astronomy basics",
        "fashion trends", "skincare routine", "makeup tutorial", "haircare tips", "sustainable clothing",
        "travel destinations", "budget travel", "camping gear", "national parks", "hotel booking",
        "music festivals", "concert tickets", "guitar lessons", "piano sheet music", "vocal training",
        "movie recommendations", "TV series to watch", "anime reviews", "manga online", "film directing",
        "book recommendations", "bestselling novels", "audiobooks", "poetry classic", "reading habits"
    ];
    dailyTasksData: any[] = [];
    countdownTimer: ReturnType<typeof setInterval> | null = null;
    
    currentProgress = {
        current: 0,
        total: 0,
        lastChecked: 0,
        completed: false,
        noProgressCount: 0
    };

    searchState = {
        currentAction: 'idle',
        countdown: 0,
        needRest: false,
        isCollapsed: true,
        dailyTasksQueue: [] as string[],
        attemptedTasks: [] as string[]
    };

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
            attemptedTasks: this.searchState.attemptedTasks,
            timestamp: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log('状态已保存到本地存储');
        } catch (e: any) {
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
                if (state.attemptedTasks) {
                    this.searchState.attemptedTasks = state.attemptedTasks;
                }
                return state;
            }
        } catch (e: any) {
            console.log('加载状态失败:', e.message);
        }
        return null;
    }

    clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('已清除本地存储状态');
        } catch (e: any) {
            console.log('清除状态失败:', e.message);
        }
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const c = JSON.parse(saved);
                if (c.restTime) config.restTime = c.restTime;
                if (c.scrollTime) config.scrollTime = c.scrollTime;
                if (c.waitTime) config.waitTime = c.waitTime;
                if (c.maxNoProgressCount) config.maxNoProgressCount = c.maxNoProgressCount;
                if (c.isCollapsed !== undefined) this.searchState.isCollapsed = c.isCollapsed;
            }
        } catch (e) {
            console.warn('加载配置失败:', e);
        }
    }

    saveConfig() {
        try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify({
                restTime: config.restTime,
                scrollTime: config.scrollTime,
                waitTime: config.waitTime,
                maxNoProgressCount: config.maxNoProgressCount,
                isCollapsed: this.searchState.isCollapsed
            }));
        } catch (e) {
            console.warn('保存配置失败:', e);
        }
    }
}

export const store = new StateStore();

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function getRandomInterval() {
    const min = config.searchInterval[0] || 5;
    const max = config.searchInterval[1] || 10;
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}
