import type { DailyTask } from './state';

const BRIDGE_CHANNEL = 'rewards-helper-panel-bridge-v1';

export type RewardsPanelBridgeAction = 'ready' | 'parse' | 'click-task' | 'close';

interface RewardsPanelBridgeRequest {
    channel: typeof BRIDGE_CHANNEL;
    direction: 'request';
    requestId: string;
    action: RewardsPanelBridgeAction;
    payload?: DailyTask;
}

interface RewardsPanelBridgeResponse<T = unknown> {
    channel: typeof BRIDGE_CHANNEL;
    direction: 'response';
    requestId: string;
    ok: boolean;
    result?: T;
    error?: string;
}

export interface RewardsPanelBridgeHandlers<TSnapshot> {
    ready: () => boolean;
    parse: () => TSnapshot;
    clickTask: (task: DailyTask) => Promise<boolean>;
    close: () => void;
}

declare global {
    interface Window {
        __rewardsHelperPanelBridgeInstalled?: boolean;
    }
}

function isTrustedBingOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        return url.protocol === 'https:' && (hostname === 'bing.com' || hostname.endsWith('.bing.com'));
    } catch {
        return false;
    }
}

function getFrameOrigin(iframe: HTMLIFrameElement): string | null {
    try {
        const origin = new URL(iframe.src, window.location.href).origin;
        return isTrustedBingOrigin(origin) ? origin : null;
    } catch {
        return null;
    }
}

export function isRewardsPanelFrameContext(): boolean {
    const hostname = window.location.hostname.toLowerCase();
    return window !== window.top && (hostname === 'rewards.bing.com' || hostname.endsWith('.rewards.bing.com'));
}

export async function requestRewardsPanelFrame<T>(
    iframe: HTMLIFrameElement,
    action: RewardsPanelBridgeAction,
    payload?: DailyTask,
    timeout = 1500
): Promise<T | null> {
    const frameWindow = iframe.contentWindow;
    const targetOrigin = getFrameOrigin(iframe);
    if (!frameWindow || !targetOrigin) return null;

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request: RewardsPanelBridgeRequest = {
        channel: BRIDGE_CHANNEL,
        direction: 'request',
        requestId,
        action,
        payload
    };

    return new Promise(resolve => {
        let settled = false;
        const finish = (value: T | null) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('message', onMessage);
            clearTimeout(timer);
            resolve(value);
        };
        const onMessage = (event: MessageEvent<RewardsPanelBridgeResponse<T>>) => {
            const message = event.data;
            if (
                event.source !== frameWindow ||
                event.origin !== targetOrigin ||
                !message ||
                message.channel !== BRIDGE_CHANNEL ||
                message.direction !== 'response' ||
                message.requestId !== requestId
            ) return;
            finish(message.ok ? (message.result ?? null) : null);
        };
        const timer = window.setTimeout(() => finish(null), timeout);
        window.addEventListener('message', onMessage);
        frameWindow.postMessage(request, targetOrigin);
    });
}

export function registerRewardsPanelFrameBridge<TSnapshot>(handlers: RewardsPanelBridgeHandlers<TSnapshot>) {
    if (!isRewardsPanelFrameContext() || window.__rewardsHelperPanelBridgeInstalled) return;
    window.__rewardsHelperPanelBridgeInstalled = true;

    window.addEventListener('message', async (event: MessageEvent<RewardsPanelBridgeRequest>) => {
        const request = event.data;
        if (
            event.source !== window.parent ||
            !isTrustedBingOrigin(event.origin) ||
            !request ||
            request.channel !== BRIDGE_CHANNEL ||
            request.direction !== 'request' ||
            typeof request.requestId !== 'string'
        ) return;

        const respond = (response: Omit<RewardsPanelBridgeResponse, 'channel' | 'direction' | 'requestId'>) => {
            window.parent.postMessage({
                channel: BRIDGE_CHANNEL,
                direction: 'response',
                requestId: request.requestId,
                ...response
            } satisfies RewardsPanelBridgeResponse, event.origin);
        };

        try {
            if (request.action === 'ready') {
                respond({ ok: true, result: handlers.ready() });
            } else if (request.action === 'parse') {
                respond({ ok: true, result: handlers.parse() });
            } else if (request.action === 'click-task' && request.payload) {
                respond({ ok: true, result: await handlers.clickTask(request.payload) });
            } else if (request.action === 'close') {
                // Reply before clicking: closing the live flyout destroys this frame.
                respond({ ok: true, result: true });
                window.setTimeout(handlers.close, 0);
            } else {
                respond({ ok: false, error: 'Unsupported Rewards panel action' });
            }
        } catch (error) {
            respond({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
    });
}
