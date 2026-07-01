import { config } from './config';
import { store } from './state';
import { isDarkMode } from './dom';
import { startAutomatedSearch, stopAutomatedSearch } from './search';
import { t } from './i18n';

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
            margin-right: 16px;
            white-space: nowrap;
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
            top: 100%;
            right: 16px;
            margin-top: 12px;
            width: 320px;
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
    `;
    document.head.appendChild(style);
}

export function createUI() {
    injectStyles();

    const badgeContainer = document.createElement('div');
    badgeContainer.style.position = 'relative';
    badgeContainer.style.display = 'inline-flex';
    badgeContainer.style.alignItems = 'center';
    badgeContainer.id = 'rewards-helper-container';
    
    let injected = false;
    const rightContainer = document.querySelector('#id_rh') || document.querySelector('.sw_pre');
    
    if (rightContainer && rightContainer.parentNode) {
        rightContainer.parentNode.insertBefore(badgeContainer, rightContainer);
        injected = true;
    } else {
        const nativeHeader = document.querySelector('#b_header');
        if (nativeHeader) {
            nativeHeader.appendChild(badgeContainer);
            injected = true;
        }
    }
    
    if (!injected) {
        // Fallback to absolute
        badgeContainer.style.position = 'fixed';
        badgeContainer.style.top = '15px';
        badgeContainer.style.right = '150px';
        badgeContainer.style.zIndex = '100000';
        document.body.appendChild(badgeContainer);
    }

    badgeContainer.innerHTML = `
        <div id="rh-badge" title="Rewards Points Farmer">
            <span style="margin-right: 6px;">🤖</span>
            <span id="rh-badge-text">${t('ui', 'init')}</span>
        </div>
        <div id="rh-dropdown">
            <div class="rh-header">
                <span>🤖 Rewards Points Farmer</span>
            </div>
            
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
    `;

    // Toast element
    if (!document.getElementById('rh-toast')) {
        const toast = document.createElement('div');
        toast.id = 'rh-toast';
        document.body.appendChild(toast);
    }

    const badge = document.getElementById('rh-badge');
    const dropdown = document.getElementById('rh-dropdown');
    
    if (badge && dropdown) {
        badge.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        };
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!badgeContainer.contains(e.target as Node)) {
                dropdown.classList.remove('show');
            }
        });
    }

    const startBtn = document.getElementById('rh-start-btn');
    if (startBtn) {
        startBtn.onclick = () => {
            if (!store.isSearching) startAutomatedSearch();
            else stopAutomatedSearch();
            if (dropdown) dropdown.classList.remove('show');
        };
    }
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
    const badge = document.getElementById('rh-badge');
    const btn = document.getElementById('rh-start-btn');
    if (btn && !store.isSearching) {
        btn.style.backgroundColor = 'var(--rh-accent)';
    }
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
