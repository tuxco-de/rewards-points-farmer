import { config } from './config';
import { store } from './state';
import { isDarkMode } from './dom';
import { t } from './i18n';

export interface UIActions {
    isWorker: boolean;
    onToggleSearch: () => void | Promise<void>;
}

export function injectStyles() {
    if (document.getElementById('rh-styles')) return;
    const style = document.createElement('style');
    style.id = 'rh-styles';
    style.textContent = `
        :root {
            --rh-bg: rgba(255, 255, 255, 0.98);
            --rh-border: rgba(0, 0, 0, 0.1);
            --rh-text: #333;
            --rh-text-sec: #666;
            --rh-accent: #0078d4;
            --rh-accent-hover: #005a9e;
            --rh-danger: #d83b01;
            --rh-success: #107c10;
            --rh-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        .b_dark, body.b_dark, [data-darkmode="true"] {
            --rh-bg: rgba(30, 30, 30, 0.98);
            --rh-border: rgba(255, 255, 255, 0.1);
            --rh-text: #f0f0f0;
            --rh-text-sec: #aaa;
            --rh-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        
        #rewards-helper-container {
            position: fixed;
            right: max(20px, env(safe-area-inset-right));
            bottom: max(20px, env(safe-area-inset-bottom));
            z-index: 100000;
            display: flex;
            align-items: flex-end;
            font-family: 'Segoe UI', system-ui, sans-serif;
        }
        #rh-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 12px;
            height: 36px;
            border-radius: 18px;
            background: var(--rh-bg);
            color: var(--rh-text);
            border: 1px solid var(--rh-border);
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            transition: all 0.2s;
            user-select: none;
            position: relative;
            z-index: 100000;
            margin: 0;
            white-space: nowrap;
            appearance: none;
        }
        #rh-badge:hover {
            background: var(--rh-accent);
            color: white;
            border-color: var(--rh-accent);
        }
        #rh-badge.searching {
            color: var(--rh-accent);
            border-color: var(--rh-accent);
        }
        #rh-badge.searching:hover {
            color: white;
        }
        
        #rh-dropdown {
            position: absolute;
            right: 0;
            bottom: calc(100% + 12px);
            width: min(320px, calc(100vw - 32px));
            max-height: calc(100vh - 92px);
            background: var(--rh-bg);
            border: 1px solid var(--rh-border);
            border-radius: 12px;
            box-shadow: var(--rh-shadow);
            padding: 16px;
            display: none;
            flex-direction: column;
            gap: 16px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            z-index: 100001;
            text-align: left;
            color: var(--rh-text);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            overflow-y: auto;
            box-sizing: border-box;
        }
        #rh-dropdown.show {
            display: flex;
            animation: rh-fade-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes rh-fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        
        .rh-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 700;
            font-size: 15px;
            border-bottom: 1px solid var(--rh-border);
            padding-bottom: 12px;
        }
        .rh-header-title {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .rh-icon-btn {
            width: 32px;
            height: 32px;
            flex: 0 0 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--rh-text);
            cursor: pointer;
            font-size: 18px;
        }
        .rh-icon-btn:hover {
            background: var(--rh-border);
        }
        .rh-view {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .rh-view[hidden] {
            display: none;
        }
        .rh-worker-mode {
            align-items: center;
            align-self: flex-start;
            background: color-mix(in srgb, var(--rh-success) 12%, transparent);
            border: 1px solid color-mix(in srgb, var(--rh-success) 32%, transparent);
            border-radius: 6px;
            color: var(--rh-success);
            display: inline-flex;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 8px;
        }
        
        .rh-progress-container {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .rh-progress-header {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 600;
        }
        .rh-progress-bar-bg {
            height: 6px;
            background: var(--rh-border);
            border-radius: 3px;
            overflow: hidden;
        }
        .rh-progress-bar-fill {
            height: 100%;
            background: var(--rh-accent);
            width: 0%;
            transition: width 0.3s ease;
        }
        .rh-status {
            font-size: 12px;
            color: var(--rh-text-sec);
        }
        
        .rh-btn {
            padding: 10px;
            border-radius: 6px;
            border: none;
            background: var(--rh-accent);
            color: white;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s, transform 0.1s;
            font-size: 14px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 6px;
        }
        .rh-btn:hover { opacity: 0.9; }
        .rh-btn:active { transform: scale(0.98); }
        .rh-btn.danger { background: var(--rh-danger); }
        .rh-settings-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .rh-settings-field > label,
        .rh-settings-label {
            color: var(--rh-text-sec);
            font-size: 12px;
            font-weight: 600;
        }
        .rh-settings-range {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 10px;
        }
        .rh-settings-range label {
            color: var(--rh-text-sec);
            display: flex;
            flex-direction: column;
            font-size: 11px;
            gap: 4px;
        }
        .rh-input {
            width: 100%;
            min-width: 0;
            height: 36px;
            padding: 0 10px;
            border: 1px solid var(--rh-border);
            border-radius: 6px;
            box-sizing: border-box;
            background: transparent;
            color: var(--rh-text);
            font: inherit;
            font-size: 13px;
        }
        .rh-input:focus {
            border-color: var(--rh-accent);
            outline: 2px solid color-mix(in srgb, var(--rh-accent) 20%, transparent);
        }
        
        .rh-tasks-section {
            border-top: 1px solid var(--rh-border);
            padding-top: 12px;
        }
        .rh-tasks-header {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
        }
        .rh-task-item {
            display: flex;
            align-items: center;
            font-size: 12px;
            padding: 4px 0;
            gap: 8px;
        }
        .rh-task-name {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        /* Toast */
        #rh-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--rh-bg);
            color: var(--rh-text);
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: var(--rh-shadow);
            border-left: 4px solid var(--rh-accent);
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-weight: 500;
            font-size: 14px;
            z-index: 100005;
            transform: translateX(120%);
            opacity: 0;
            visibility: hidden;
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s, visibility 0.3s;
            pointer-events: none;
        }
        #rh-toast.show {
            transform: translateX(0);
            opacity: 1;
            visibility: visible;
        }
        @media (max-width: 480px) {
            #rewards-helper-container {
                right: max(12px, env(safe-area-inset-right));
                bottom: max(12px, env(safe-area-inset-bottom));
            }
            #rh-dropdown {
                width: calc(100vw - 24px);
                max-height: calc(100vh - 76px);
            }
        }
    `;
    document.head.appendChild(style);
}

export function createUI(actions: UIActions) {
    injectStyles();

    const badgeContainer = document.createElement('div');
    badgeContainer.id = 'rewards-helper-container';
    document.body.appendChild(badgeContainer);

    badgeContainer.innerHTML = `
        <button id="rh-badge" type="button" title="Rewards Points Farmer" aria-haspopup="dialog" aria-expanded="false">
            <span style="margin-right: 6px;">🤖</span>
            <span id="rh-badge-text">${t('ui', 'init')}</span>
        </button>
        <div id="rh-dropdown" role="dialog" aria-label="Rewards Points Farmer">
            <div class="rh-header">
                <span id="rh-panel-title" class="rh-header-title">🤖 Rewards Points Farmer</span>
                <button id="rh-settings-toggle" class="rh-icon-btn" type="button" aria-label="${t('ui', 'settings')}" title="${t('ui', 'settings')}">⚙</button>
            </div>

            <div id="rh-main-view" class="rh-view">
                ${actions.isWorker ? `<div id="rh-worker-mode" class="rh-worker-mode">${t('ui', 'dedicatedWorker')}</div>` : ''}
                <div class="rh-progress-container">
                    <div class="rh-progress-header">
                        <span>${t('ui', 'searchProgress')}</span>
                        <span id="rh-progress-text">0 / 0</span>
                    </div>
                    <div class="rh-progress-bar-bg">
                        <div id="rh-progress-fill" class="rh-progress-bar-fill"></div>
                    </div>
                    <div id="rh-status-text" class="rh-status">${t('ui', 'statusInit')}</div>
                </div>

                <button id="rh-start-btn" class="rh-btn">${t('ui', 'startFarming')}</button>

                <div class="rh-tasks-section">
                    <div class="rh-tasks-header">
                        <span>${t('ui', 'dailyTasks')}</span>
                        <span id="rh-tasks-count" style="color: var(--rh-text-sec);"></span>
                    </div>
                    <div id="rh-tasks-list">
                        <div style="font-size: 12px; color: var(--rh-text-sec);">${t('ui', 'fetchingTasks')}</div>
                    </div>
                </div>
            </div>

            <div id="rh-settings-view" class="rh-view" hidden>
                <div class="rh-settings-field">
                    <span class="rh-settings-label">${t('ui', 'searchInterval')}</span>
                    <div class="rh-settings-range">
                        <label>${t('ui', 'minInterval')}
                            <input id="rh-min-interval" class="rh-input" type="number" min="1" max="300" step="1">
                        </label>
                        <label>${t('ui', 'maxInterval')}
                            <input id="rh-max-interval" class="rh-input" type="number" min="1" max="300" step="1">
                        </label>
                    </div>
                </div>
                <div class="rh-settings-field">
                    <label for="rh-scroll-time">${t('ui', 'scrollTime')}</label>
                    <input id="rh-scroll-time" class="rh-input" type="number" min="3" max="120" step="1">
                </div>
                <div class="rh-settings-field">
                    <label for="rh-rest-time">${t('ui', 'restTime')}</label>
                    <input id="rh-rest-time" class="rh-input" type="number" min="1" max="120" step="1">
                </div>
                <div class="rh-settings-field">
                    <label for="rh-max-no-progress">${t('ui', 'maxNoProgressCount')}</label>
                    <input id="rh-max-no-progress" class="rh-input" type="number" min="1" max="20" step="1">
                </div>
                <button id="rh-save-settings" class="rh-btn" type="button">${t('ui', 'saveSettings')}</button>
            </div>
        </div>
    `;

    // Toast element
    if (!document.getElementById('rh-toast')) {
        const toast = document.createElement('div');
        toast.id = 'rh-toast';
        document.body.appendChild(toast);
    }

    const badge = document.getElementById('rh-badge');
    const dropdown = document.getElementById('rh-dropdown');
    const settingsToggle = document.getElementById('rh-settings-toggle') as HTMLButtonElement | null;
    const panelTitle = document.getElementById('rh-panel-title');
    const mainView = document.getElementById('rh-main-view');
    const settingsView = document.getElementById('rh-settings-view');

    const setInputValue = (id: string, value: number) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = String(value);
    };

    const showSettings = (visible: boolean) => {
        if (!mainView || !settingsView || !settingsToggle || !panelTitle) return;
        mainView.hidden = visible;
        settingsView.hidden = !visible;
        panelTitle.textContent = visible ? t('ui', 'settings') : '🤖 Rewards Points Farmer';
        settingsToggle.textContent = visible ? '←' : '⚙';
        settingsToggle.setAttribute('aria-label', t('ui', visible ? 'back' : 'settings'));
        settingsToggle.title = t('ui', visible ? 'back' : 'settings');

        if (visible) {
            setInputValue('rh-min-interval', config.searchInterval[0]);
            setInputValue('rh-max-interval', config.searchInterval[1]);
            setInputValue('rh-scroll-time', config.scrollTime);
            setInputValue('rh-rest-time', Math.max(1, Math.round(config.restTime / 60)));
            setInputValue('rh-max-no-progress', config.maxNoProgressCount);
        }
    };

    const readClampedNumber = (id: string, min: number, max: number, fallback: number) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        const value = Number(input?.value);
        if (!Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, Math.round(value)));
    };
    
    if (badge && dropdown) {
        badge.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
            badge.setAttribute('aria-expanded', String(dropdown.classList.contains('show')));
        };
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!badgeContainer.contains(e.target as Node)) {
                dropdown.classList.remove('show');
                badge.setAttribute('aria-expanded', 'false');
                showSettings(false);
            }
        });
    }

    if (settingsToggle) {
        settingsToggle.onclick = (event) => {
            event.stopPropagation();
            showSettings(Boolean(settingsView?.hidden ?? true));
        };
    }

    const saveSettingsBtn = document.getElementById('rh-save-settings');
    if (saveSettingsBtn) {
        saveSettingsBtn.onclick = () => {
            const minInterval = readClampedNumber('rh-min-interval', 1, 300, config.searchInterval[0]);
            const maxInterval = readClampedNumber('rh-max-interval', minInterval, 300, config.searchInterval[1]);
            config.searchInterval = [minInterval, maxInterval];
            config.scrollTime = readClampedNumber('rh-scroll-time', 3, 120, config.scrollTime);
            config.restTime = readClampedNumber('rh-rest-time', 1, 120, Math.round(config.restTime / 60)) * 60;
            config.maxNoProgressCount = readClampedNumber('rh-max-no-progress', 1, 20, config.maxNoProgressCount);
            store.saveConfig();
            showSettings(false);
            showToast(t('ui', 'settingsSaved'));
        };
    }

    const startBtn = document.getElementById('rh-start-btn');
    if (startBtn) {
        startBtn.onclick = async () => {
            await actions.onToggleSearch();
            if (dropdown) {
                dropdown.classList.remove('show');
                badge?.setAttribute('aria-expanded', 'false');
            }
        };
    }
}

export function openSettingsPanel() {
    const badge = document.getElementById('rh-badge');
    const dropdown = document.getElementById('rh-dropdown');
    const settingsToggle = document.getElementById('rh-settings-toggle') as HTMLButtonElement | null;
    const settingsView = document.getElementById('rh-settings-view');

    if (!dropdown || !settingsToggle || !settingsView) return;
    dropdown.classList.add('show');
    badge?.setAttribute('aria-expanded', 'true');
    if (settingsView.hidden) settingsToggle.click();
}

export function showToast(message: string, duration = 3000) {
    const toast = document.getElementById('rh-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

export function updateStatus(message: string) {
    const statusText = document.getElementById('rh-status-text');
    if (statusText) statusText.textContent = `${t('ui', 'statusPrefix')}${message}`;
    console.log(message);
}

export function updateProgressUI() {
    const badgeText = document.getElementById('rh-badge-text');
    const progressText = document.getElementById('rh-progress-text');
    const progressFill = document.getElementById('rh-progress-fill');
    
    const curr = store.currentProgress.current || 0;
    const total = store.currentProgress.total || 0;
    const isCompleted = store.currentProgress.completed;
    
    const text = isCompleted ? t('ui', 'completed') : `${curr}/${total}`;
    
    if (badgeText) badgeText.textContent = text;
    if (progressText) progressText.textContent = text;
    
    if (progressFill && total > 0) {
        const percent = Math.min(100, Math.max(0, (curr / total) * 100));
        progressFill.style.width = `${percent}%`;
    }
}

export function updateCountdown(seconds: number, action: string) {
    const statusText = document.getElementById('rh-status-text');
    if (!statusText) return;
    
    if (seconds > 0) {
        let actionText = '';
        switch (action) {
            case 'scrolling': actionText = t('ui', 'statusScrolling'); break;
            case 'waiting': actionText = t('ui', 'statusWaiting'); break;
            case 'resting': actionText = t('ui', 'statusResting'); break;
            case 'checking': actionText = t('ui', 'statusChecking'); break;
            default: actionText = t('ui', 'statusCountdown');
        }
        statusText.textContent = `${t('ui', 'statusPrefix')}⏳ ${actionText}... (${seconds}s)`;
    } else {
        // Reset to default status logic is handled by caller via updateStatus
    }
}

export function updateDailyTasksUI(tasks: any[]) {
    const tasksList = document.getElementById('rh-tasks-list');
    const tasksCount = document.getElementById('rh-tasks-count');
    if (!tasksList) return;

    if (!tasks || tasks.length === 0) {
        tasksList.innerHTML = `<div style="color: var(--rh-success); font-weight: 500;">${t('parser', 'noTasks')}</div>`;
        if (tasksCount) tasksCount.textContent = '';
        return;
    }

    const allCompleted = tasks.every(t => t.status === '已完成');
    const completedCount = tasks.filter(t => t.status === '已完成').length;
    
    if (tasksCount) {
        tasksCount.textContent = `(${completedCount}/${tasks.length})`;
    }

    if (allCompleted) {
        tasksList.innerHTML = `<div style="color: var(--rh-success); font-weight: 500; font-size: 13px;">${t('parser', 'allTasksDone')}</div>`;
        return;
    }

    tasksList.innerHTML = '';
    tasks.forEach(task => {
        const isCompleted = task.status === '已完成';
        
        const taskElem = document.createElement('div');
        taskElem.className = 'rh-task-item';
        taskElem.title = task.name; // Tooltip for full name
        
        const icon = document.createElement('span');
        icon.textContent = isCompleted ? '✅' : '⏳';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'rh-task-name';
        nameSpan.textContent = task.name;
        if (isCompleted) {
            nameSpan.style.textDecoration = 'line-through';
            nameSpan.style.color = 'var(--rh-text-sec)';
        }
        
        taskElem.appendChild(icon);
        taskElem.appendChild(nameSpan);
        tasksList.appendChild(taskElem);
    });
}

export function showCompletionNotification() {
    showToast(t('status', 'allCompletedToast', store.currentProgress.total), 6000);
}

export function applyTheme() {
    // Theme is mostly handled by CSS matching .b_dark on body/html
}

export function setSearchButtonState(state: 'searching' | 'idle') {
    const btn = document.getElementById('rh-start-btn');
    const badge = document.getElementById('rh-badge');
    if (btn) {
        if (state === 'searching') {
            btn.textContent = t('ui', 'stopFarming');
            btn.className = 'rh-btn danger';
        } else {
            btn.textContent = t('ui', 'startFarming');
            btn.className = 'rh-btn';
        }
    }
    if (badge) {
        if (state === 'searching') {
            badge.classList.add('searching');
        } else {
            badge.classList.remove('searching');
        }
    }
}

export function toggleCollapse() {}
export function applyCollapseState() {}
export function makeDraggable() {}
