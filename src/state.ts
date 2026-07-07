import { config } from './config';

const STORAGE_KEY = 'bing_rewards_auto_searcher_state';
const CONFIG_KEY = 'bing_rewards_config';
export const MAX_DAILY_TASK_ATTEMPTS = 4;

export type DailyTaskStatus = '未完成' | '已完成';

export interface DailyTask {
    url: string;
    title: string;
    status: DailyTaskStatus;
    points: number;
    queryCandidates: string[];
    attempts: number;
    lastAttemptAt?: number;
    source?: string;
}

function extractQueryFromUrl(url: string): string {
    try {
        const parsed = new URL(url, window.location.origin);
        return (parsed.searchParams.get('q') || '').trim();
    } catch {
        return '';
    }
}

function normalizeCandidate(candidate: string): string {
    return candidate
        .replace(/\s+/g, ' ')
        .replace(/\b(?:not completed|completed|points?|pts)\b/gi, ' ')
        .replace(/未完成|已完成|积分|添加/g, ' ')
        .replace(/\+\s*\d+/g, ' ')
        .trim();
}

function uniqueCandidates(candidates: string[]): string[] {
    const result: string[] = [];
    candidates.forEach(candidate => {
        const cleaned = normalizeCandidate(candidate);
        if (cleaned.length >= 2 && cleaned.length <= 80 && !result.some(v => v.toLowerCase() === cleaned.toLowerCase())) {
            result.push(cleaned);
        }
    });
    return result;
}

export function normalizeDailyTaskEntry(entry: any): DailyTask | null {
    if (!entry) return null;
    if (typeof entry === 'string') {
        const query = extractQueryFromUrl(entry);
        return {
            url: entry,
            title: query || entry,
            status: '未完成',
            points: 0,
            queryCandidates: uniqueCandidates([query, entry]),
            attempts: 0,
            source: 'legacy'
        };
    }

    if (typeof entry !== 'object') return null;
    const url = String(entry.url || '').trim();
    const title = normalizeCandidate(String(entry.title || extractQueryFromUrl(url) || url));
    if (!url && !title) return null;

    return {
        url,
        title,
        status: entry.status === '已完成' ? '已完成' : '未完成',
        points: Number(entry.points || 0),
        queryCandidates: uniqueCandidates([
            ...(Array.isArray(entry.queryCandidates) ? entry.queryCandidates : []),
            title,
            extractQueryFromUrl(url)
        ]),
        attempts: Math.max(0, Number(entry.attempts || 0)),
        lastAttemptAt: Number(entry.lastAttemptAt || 0) || undefined,
        source: entry.source ? String(entry.source) : undefined
    };
}

export function getDailyTaskKey(task: DailyTask | string): string {
    if (typeof task === 'string') return task;
    return task.url || task.title;
}

export function getDailyTaskUrl(task: DailyTask | string): string {
    return typeof task === 'string' ? task : task.url;
}

export function normalizeDailyTaskQueue(entries: any[]): DailyTask[] {
    const queue: DailyTask[] = [];
    (entries || []).forEach(entry => {
        const task = normalizeDailyTaskEntry(entry);
        if (!task) return;
        const key = getDailyTaskKey(task);
        if (!key || queue.some(existing => getDailyTaskKey(existing) === key)) return;
        queue.push(task);
    });
    return queue;
}

export function upsertDailyTask(taskInput: DailyTask | string): boolean {
    const task = normalizeDailyTaskEntry(taskInput);
    if (!task || task.status === '已完成') return false;
    const key = getDailyTaskKey(task);
    if (!key || store.searchState.attemptedTasks.includes(key)) return false;

    const existing = store.searchState.dailyTasksQueue.find(item => getDailyTaskKey(item) === key);
    if (existing) {
        existing.title = task.title || existing.title;
        existing.status = task.status;
        existing.points = task.points || existing.points;
        existing.queryCandidates = uniqueCandidates([...existing.queryCandidates, ...task.queryCandidates]);
        existing.source = task.source || existing.source;
        return false;
    }

    store.searchState.dailyTasksQueue.push(task);
    return true;
}

export function removeDailyTask(taskInput: DailyTask | string) {
    const key = getDailyTaskKey(taskInput);
    store.searchState.dailyTasksQueue = store.searchState.dailyTasksQueue.filter(task => getDailyTaskKey(task) !== key);
}

export function recordDailyTaskAttempt(taskInput: DailyTask | string): DailyTask | null {
    const key = getDailyTaskKey(taskInput);
    const task = store.searchState.dailyTasksQueue.find(item => getDailyTaskKey(item) === key) || normalizeDailyTaskEntry(taskInput);
    if (!task) return null;
    task.attempts += 1;
    task.lastAttemptAt = Date.now();
    return task;
}

export function markDailyTaskSkipped(taskInput: DailyTask | string) {
    const key = getDailyTaskKey(taskInput);
    if (key && !store.searchState.attemptedTasks.includes(key)) {
        store.searchState.attemptedTasks.push(key);
    }
    removeDailyTask(taskInput);
}

export function getDailyTaskSearchTerm(task: DailyTask): string {
    const index = Math.max(0, Math.min(task.attempts - 1, task.queryCandidates.length - 1));
    return task.queryCandidates[index] || task.title;
}

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
        dailyTasksQueue: [] as DailyTask[],
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
            dailyTasksData: this.dailyTasksData,
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
                    this.searchState.dailyTasksQueue = normalizeDailyTaskQueue(state.dailyTasksQueue);
                }
                if (state.attemptedTasks) {
                    this.searchState.attemptedTasks = state.attemptedTasks;
                }
                if (state.dailyTasksData) {
                    this.dailyTasksData = state.dailyTasksData;
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
