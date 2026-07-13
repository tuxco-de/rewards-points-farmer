const WORKER_QUERY_PARAM = 'rewards_helper_worker';
const WORKER_AUTOSTART_PARAM = 'rewards_helper_autostart';
const WORKER_SESSION_KEY = 'bing_rewards_worker_session';
const WORKER_TAB_ID_KEY = 'bing_rewards_worker_tab_id';
const WORKER_LAST_COMMAND_KEY = 'bing_rewards_worker_last_command';
const WORKER_COMMAND_KEY = 'bing_rewards_worker_command';
const WORKER_LEASE_KEY = 'bing_rewards_worker_lease';
const WORKER_WINDOW_NAME = 'rewards-points-farmer-worker';
const WORKER_LEASE_MS = 15_000;
const WORKER_HEARTBEAT_MS = 5_000;
const COMMAND_MAX_AGE_MS = 60_000;

export type WorkerCommandAction = 'start' | 'stop';

export interface WorkerCommand {
    action: WorkerCommandAction;
    id: string;
    createdAt: number;
}

interface WorkerLease {
    tabId: string;
    expiresAt: number;
}

let workerContext = false;
let workerTabId = '';
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseStoredValue<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : null;
    } catch {
        return null;
    }
}

function readWorkerLease(): WorkerLease | null {
    return parseStoredValue<WorkerLease>(WORKER_LEASE_KEY);
}

function writeWorkerLease() {
    if (!workerTabId) return;
    localStorage.setItem(WORKER_LEASE_KEY, JSON.stringify({
        tabId: workerTabId,
        expiresAt: Date.now() + WORKER_LEASE_MS
    } satisfies WorkerLease));
}

function claimWorkerLease(force = false): boolean {
    const lease = readWorkerLease();
    if (!force && lease && lease.expiresAt > Date.now() && lease.tabId !== workerTabId) {
        return false;
    }

    writeWorkerLease();
    return readWorkerLease()?.tabId === workerTabId;
}

function startWorkerHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        if (!workerContext) return;
        const lease = readWorkerLease();
        if (lease && lease.expiresAt > Date.now() && lease.tabId !== workerTabId) {
            workerContext = false;
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            return;
        }
        writeWorkerLease();
    }, WORKER_HEARTBEAT_MS);
}

function isWorkerCandidate(): boolean {
    const queryMarked = new URLSearchParams(window.location.search).get(WORKER_QUERY_PARAM) === '1';
    const sessionMarked = sessionStorage.getItem(WORKER_SESSION_KEY) === '1';
    return queryMarked || sessionMarked || window.name === WORKER_WINDOW_NAME;
}

export function initializeDedicatedWorkerContext(): boolean {
    if (!isWorkerCandidate()) return false;

    sessionStorage.setItem(WORKER_SESSION_KEY, '1');
    if (window.name !== WORKER_WINDOW_NAME) window.name = WORKER_WINDOW_NAME;

    workerTabId = sessionStorage.getItem(WORKER_TAB_ID_KEY) || createId();
    sessionStorage.setItem(WORKER_TAB_ID_KEY, workerTabId);
    const forceClaim = new URLSearchParams(window.location.search).get(WORKER_AUTOSTART_PARAM) === '1';
    workerContext = claimWorkerLease(forceClaim);

    if (workerContext) startWorkerHeartbeat();
    return workerContext;
}

export function isDedicatedWorkerContext(): boolean {
    if (!workerContext) return false;
    const lease = readWorkerLease();
    return !lease || lease.expiresAt <= Date.now() || lease.tabId === workerTabId;
}

function publishWorkerCommand(action: WorkerCommandAction): WorkerCommand {
    const command: WorkerCommand = {
        action,
        id: createId(),
        createdAt: Date.now()
    };
    localStorage.setItem(WORKER_COMMAND_KEY, JSON.stringify(command));
    return command;
}

function buildWorkerUrl(): string {
    const url = new URL(window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') url.pathname = '/';
    url.search = '';
    url.hash = '';
    url.searchParams.set(WORKER_QUERY_PARAM, '1');
    url.searchParams.set(WORKER_AUTOSTART_PARAM, '1');
    return url.toString();
}

export function requestDedicatedWorkerStart(): boolean {
    const workerWindow = window.open(buildWorkerUrl(), WORKER_WINDOW_NAME);
    if (!workerWindow) return false;
    publishWorkerCommand('start');
    return true;
}

export function requestDedicatedWorkerStop() {
    publishWorkerCommand('stop');
}

function readPendingWorkerCommand(): WorkerCommand | null {
    const command = parseStoredValue<WorkerCommand>(WORKER_COMMAND_KEY);
    if (!command || Date.now() - command.createdAt > COMMAND_MAX_AGE_MS) return null;
    return command;
}

function consumeCommand(command: WorkerCommand | null): WorkerCommand | null {
    if (!command) return null;
    if (sessionStorage.getItem(WORKER_LAST_COMMAND_KEY) === command.id) return null;
    sessionStorage.setItem(WORKER_LAST_COMMAND_KEY, command.id);
    return command;
}

export function consumePendingWorkerCommand(): WorkerCommand | null {
    const command = consumeCommand(readPendingWorkerCommand());
    if (command) return command;

    const shouldAutoStart = new URLSearchParams(window.location.search).get(WORKER_AUTOSTART_PARAM) === '1';
    const autoStartId = `url:${window.location.href}`;
    if (shouldAutoStart && sessionStorage.getItem(WORKER_LAST_COMMAND_KEY) !== autoStartId) {
        sessionStorage.setItem(WORKER_LAST_COMMAND_KEY, autoStartId);
        return { action: 'start', id: autoStartId, createdAt: Date.now() };
    }
    return null;
}

export function listenForWorkerCommands(handler: (command: WorkerCommand) => void): () => void {
    const listener = (event: StorageEvent) => {
        if (!isDedicatedWorkerContext() || event.key !== WORKER_COMMAND_KEY || !event.newValue) return;
        try {
            const command = consumeCommand(JSON.parse(event.newValue) as WorkerCommand);
            if (command) handler(command);
        } catch {
            // Ignore malformed cross-tab commands.
        }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
}
