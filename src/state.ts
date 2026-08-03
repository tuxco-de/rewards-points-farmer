import { config } from './config';

export const STORAGE_KEY = 'bing_rewards_auto_searcher_state';
const CONFIG_KEY = 'bing_rewards_config';
export const MAX_DAILY_TASK_ATTEMPTS = 4;
export const MAX_PANEL_FAILURES = 5;
export const MAX_TOTAL_SEARCH_ATTEMPTS = 100;
export const MAX_REST_CYCLES = 3;

export type DailyTaskStatus = '未完成' | '已完成';
export type DailyTaskKind = 'search-promotion' | 'navigation';

export interface DailyTask {
    url: string;
    title: string;
    status: DailyTaskStatus;
    points: number;
    kind: DailyTaskKind;
    searchTerms: string[];
    attempts: number;
    lastAttemptAt?: number;
    source?: 'card';
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
        .replace(/未完成|已完成|已跳过|积分|添加/g, ' ')
        .replace(/\+\s*\d+/g, ' ')
        .trim();
}

export function isUrlLikeSearchCandidate(candidate: string): boolean {
    let decoded = String(candidate || '').trim();
    for (let i = 0; i < 2; i++) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            break;
        }
    }

    return /^(?:[a-z][a-z0-9+.-]*:|\/\/|www\.|\/)/i.test(decoded) ||
        /^(?:[\w-]+\.)+[a-z]{2,}(?:[\/:?#]|$)/i.test(decoded) ||
        /\b(?:www\.)?bing\.com(?:[\/:?#]|$)/i.test(decoded);
}

function uniqueCandidates(candidates: string[]): string[] {
    const result: string[] = [];
    candidates.forEach(candidate => {
        const cleaned = normalizeCandidate(candidate);
        if (cleaned.length >= 2 && cleaned.length <= 80 && !isUrlLikeSearchCandidate(cleaned) && !result.some(v => v.toLowerCase() === cleaned.toLowerCase())) {
            result.push(cleaned);
        }
    });
    return result;
}

function normalizeDailyTaskEntry(entry: unknown): DailyTask | null {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const candidate = entry as Partial<DailyTask>;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    const title = normalizeCandidate(
        typeof candidate.title === 'string'
            ? candidate.title
            : extractQueryFromUrl(url) || url
    );
    if (!url && !title) return null;

    return {
        url,
        title,
        status: candidate.status === '已完成' ? '已完成' : '未完成',
        points: Number(candidate.points || 0),
        kind: candidate.kind === 'search-promotion' ? 'search-promotion' : 'navigation',
        searchTerms: uniqueCandidates([
            ...(Array.isArray(candidate.searchTerms)
                ? candidate.searchTerms.filter((value): value is string => typeof value === 'string')
                : [])
        ]),
        attempts: Math.max(0, Number(candidate.attempts || 0)),
        lastAttemptAt: Number(candidate.lastAttemptAt || 0) || undefined,
        source: candidate.source === 'card' ? 'card' : undefined
    };
}

export function getDailyTaskKey(task: DailyTask): string {
    return task.url || task.title;
}

function normalizeDailyTaskQueue(entries: unknown): DailyTask[] {
    if (!Array.isArray(entries)) return [];
    const queue: DailyTask[] = [];
    entries.forEach(entry => {
        const task = normalizeDailyTaskEntry(entry);
        if (!task) return;
        const key = getDailyTaskKey(task);
        if (!key || queue.some(existing => getDailyTaskKey(existing) === key)) return;
        queue.push(task);
    });
    return queue;
}

export function upsertDailyTask(taskInput: DailyTask): boolean {
    const task = normalizeDailyTaskEntry(taskInput);
    if (!task || task.status === '已完成') return false;
    const key = getDailyTaskKey(task);
    if (!key || store.searchState.attemptedTasks.includes(key)) return false;

    const existing = store.searchState.dailyTasksQueue.find(item => getDailyTaskKey(item) === key);
    if (existing) {
        existing.title = task.title || existing.title;
        existing.status = task.status;
        existing.points = task.points || existing.points;
        if (task.kind === 'search-promotion') {
            existing.kind = 'search-promotion';
            if (task.searchTerms.length > 0) {
                existing.searchTerms = [...task.searchTerms];
            }
        }
        existing.source = task.source || existing.source;
        return false;
    }

    store.searchState.dailyTasksQueue.push(task);
    return true;
}

export function removeDailyTask(taskInput: DailyTask) {
    const key = getDailyTaskKey(taskInput);
    store.searchState.dailyTasksQueue = store.searchState.dailyTasksQueue.filter(task => getDailyTaskKey(task) !== key);
}

export function recordDailyTaskAttempt(taskInput: DailyTask): DailyTask | null {
    const key = getDailyTaskKey(taskInput);
    const task = store.searchState.dailyTasksQueue.find(item => getDailyTaskKey(item) === key);
    if (!task) return null;
    task.attempts += 1;
    task.lastAttemptAt = Date.now();
    return task;
}

export function markDailyTaskSkipped(taskInput: DailyTask) {
    const key = getDailyTaskKey(taskInput);
    if (key && !store.searchState.attemptedTasks.includes(key)) {
        store.searchState.attemptedTasks.push(key);
    }
    const fullTitle = taskInput.title;
    const shortenedTitle = fullTitle.length > 25 ? fullTitle.substring(0, 25) + '...' : fullTitle;
    store.dailyTasksData = store.dailyTasksData.map(task => {
        const displayName = String(task?.name || task?.title || '');
        return displayName === fullTitle || displayName === shortenedTitle
            ? { ...task, status: '已跳过' }
            : task;
    });
    removeDailyTask(taskInput);
}

export function getDailyTaskSearchTerm(task: DailyTask): string {
    if (task.kind !== 'search-promotion' || task.searchTerms.length === 0) return '';
    const index = Math.max(0, task.attempts - 1);
    return task.searchTerms[index] || '';
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
        panelParsed: false,
        panelFailureCount: 0,
        totalSearchAttempts: 0,
        restCycles: 0,
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
            panelFailureCount: this.searchState.panelFailureCount,
            totalSearchAttempts: this.searchState.totalSearchAttempts,
            restCycles: this.searchState.restCycles,
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
                this.searchState.panelFailureCount = Math.max(0, Number(state.panelFailureCount || 0));
                this.searchState.totalSearchAttempts = Math.max(0, Number(state.totalSearchAttempts || 0));
                this.searchState.restCycles = Math.max(0, Number(state.restCycles || 0));
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

    resetRuntimeState(preserveProgress = false) {
        this.isSearching = false;
        this.usedSearchTerms = [];
        this.mainPageSearchTerms = [];
        this.iframeSearchTerms = [];
        this.dynamicSearchTerms = [];
        if (!preserveProgress) this.dailyTasksData = [];
        this.searchState.currentAction = 'idle';
        this.searchState.countdown = 0;
        this.searchState.needRest = false;
        this.searchState.panelParsed = false;
        this.searchState.panelFailureCount = 0;
        this.searchState.totalSearchAttempts = 0;
        this.searchState.restCycles = 0;
        this.searchState.dailyTasksQueue = [];
        this.searchState.attemptedTasks = [];
        if (!preserveProgress) {
            this.currentProgress = {
                current: 0,
                total: 0,
                lastChecked: 0,
                completed: false,
                noProgressCount: 0
            };
        } else {
            this.currentProgress.noProgressCount = 0;
        }
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const c = JSON.parse(saved);
                if (Number.isFinite(c.restTime) && c.restTime > 0) config.restTime = c.restTime;
                if (Number.isFinite(c.scrollTime) && c.scrollTime > 0) config.scrollTime = c.scrollTime;
                if (Number.isFinite(c.maxNoProgressCount) && c.maxNoProgressCount > 0) {
                    config.maxNoProgressCount = c.maxNoProgressCount;
                }
                if (Array.isArray(c.searchInterval) && c.searchInterval.length === 2) {
                    const min = Number(c.searchInterval[0]);
                    const max = Number(c.searchInterval[1]);
                    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
                        config.searchInterval = [min, max];
                    }
                }
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
                searchInterval: config.searchInterval,
                maxNoProgressCount: config.maxNoProgressCount
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
