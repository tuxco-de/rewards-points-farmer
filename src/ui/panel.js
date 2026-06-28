import { store } from "../state.js";
import { isDarkMode, sleep } from "../utils.js";
import { startAutomatedSearch, stopAutomatedSearch } from "../core/searcher.js";

    function injectStyles() {
        if (document.getElementById('rh-styles')) return;
        const style = document.createElement('style');
        style.id = 'rh-styles';
        style.textContent = `
            #rewards-helper-container {
                --bg: rgba(255, 255, 255, 0.95);
                --border: rgba(0, 0, 0, 0.1);
                --text: #333;
                --text-sec: #666;
                --input-bg: #f9f9f9;
                --input-border: #ccc;
                --accent: #0078d4;
                --accent-hover: #005a9e;
                --accent-danger: #d83b01;
                --accent-danger-hover: #a82e00;
                --shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                
                position: fixed; bottom: 20px; right: 20px;
                background: var(--bg); color: var(--text);
                border: 1px solid var(--border); border-radius: 12px; padding: 12px; z-index: 10000;
                box-shadow: var(--shadow); width: 280px; font-size: 13px; line-height: 1.5;
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                transition: height 0.3s ease, transform 0.2s ease;
                height: auto !important; max-height: calc(100vh - 40px); overflow-y: auto; display: flex; flex-direction: column;
            }
            #rewards-helper-container.dark-theme {
                --bg: rgba(30, 30, 30, 0.95);
                --border: rgba(255, 255, 255, 0.1);
                --text: #f0f0f0;
                --text-sec: #aaa;
                --input-bg: #2d2d2d;
                --input-border: #555;
            }
            #rewards-helper-container * { box-sizing: border-box; }
            .rh-header { font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center; cursor: move; font-size: 14px; user-select: none; }
            .rh-header-controls { display: flex; align-items: center; gap: 8px; }
            .rh-icon-btn { cursor: pointer; font-size: 16px; color: var(--text-sec); transition: color 0.2s, background 0.2s; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 4px; line-height: 1; }
            .rh-icon-btn:hover { color: var(--text); background: rgba(128,128,128,0.15); }
            
            #rewards-helper-content { transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease; max-height: 800px; opacity: 1; overflow: hidden; }
            #rewards-helper-content.collapsed { max-height: 0; opacity: 0; pointer-events: none; margin: 0; }
            
            .rh-status-box { background: rgba(0, 120, 212, 0.08); border-left: 3px solid var(--accent); padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; transition: all 0.3s ease; }
            .rh-status-box.rh-error { background: rgba(216, 59, 1, 0.08); border-left-color: var(--accent-danger); }
            .rh-status-text { font-weight: 500; color: var(--text); font-size: 12px; margin-bottom: 2px; }
            .rh-countdown { margin-top: 2px; font-weight: 600; color: var(--accent); font-size: 12px; }
            
            .rh-section-title { font-weight: 600; margin-top: 10px; margin-bottom: 4px; font-size: 11px; color: var(--text-sec); text-transform: uppercase; letter-spacing: 0.5px; }
            .rh-list-container { max-height: 100px; overflow-y: auto; font-size: 12px; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; }
            .rh-list-container::-webkit-scrollbar { width: 4px; }
            .rh-list-container::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
            
            .rh-config-grid { display: grid; grid-template-columns: 1fr 60px; gap: 6px; align-items: center; margin-bottom: 10px; font-size: 12px; }
            .rh-input { width: 100%; background: var(--input-bg); color: var(--text); border: 1px solid var(--input-border); border-radius: 4px; padding: 4px 6px; font-size: 12px; transition: border-color 0.2s; outline: none; }
            .rh-input:focus { border-color: var(--accent); }
            
            .rh-btn { padding: 8px 16px; cursor: pointer; background-color: var(--accent); color: white; border: none; border-radius: 6px; width: 100%; font-size: 14px; font-weight: 600; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; justify-content: center; align-items: center; gap: 6px; }
            .rh-btn:hover { background-color: var(--accent-hover); }
            .rh-btn:active { transform: scale(0.98); }
            .rh-btn.danger { background-color: var(--accent-danger) !important; }
            .rh-btn.danger:hover { background-color: var(--accent-danger-hover) !important; }
            
            .rh-term-tag { display: inline-block; background: rgba(0, 120, 212, 0.1); color: var(--accent); padding: 2px 6px; border-radius: 4px; margin-right: 4px; margin-bottom: 4px; font-size: 11px; white-space: nowrap; }
            
            .rh-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 8px; margin-top: -4px; }
            .rh-tab { flex: 1; text-align: center; padding: 6px 0; font-size: 13px; font-weight: 600; color: var(--text-sec); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; user-select: none; }
            .rh-tab:hover { color: var(--text); background: rgba(128,128,128,0.05); }
            .rh-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
            .rh-tab-pane { display: none; }
            .rh-tab-pane.active { display: block; }
        `;
        document.head.appendChild(style);
    }

    function createUI() {
        injectStyles();

        const container = document.createElement('div');
        container.id = 'rewards-helper-container';
        if (isDarkMode()) container.classList.add('dark-theme');

        container.innerHTML = `
            <div class="rh-header">
                <span>🤖 Rewards 助手</span>
                <div class="rh-header-controls">
                    <div id="minimize-btn" class="rh-icon-btn" title="折叠/展开">−</div>
                    <div id="close-btn" class="rh-icon-btn" title="关闭">×</div>
                </div>
            </div>
            
            <div class="rh-status-box" id="always-visible-status" style="display: none; margin-bottom: 0;">
                <div id="search-status-mini" class="rh-status-text">就绪</div>
            </div>

            <div id="rewards-helper-content">
                <div class="rh-tabs">
                    <div class="rh-tab active" data-target="rh-pane-main">任务</div>
                    <div class="rh-tab" data-target="rh-pane-terms">词库</div>
                    <div class="rh-tab" data-target="rh-pane-settings">设置</div>
                </div>

                <div id="rh-pane-main" class="rh-tab-pane active">
                    <div class="rh-status-box">
                        <div id="rewards-progress" class="rh-status-text" style="font-weight: 700; font-size: 13px;">进度: 加载中...</div>
                        <div id="search-status" class="rh-status-text" style="color: var(--text-sec);">初始化中...</div>
                        <div id="countdown" class="rh-countdown" style="display: none;"></div>
                    </div>

                    <div class="rh-section-title" id="daily-tasks-summary" style="margin-top:0;">每日任务</div>
                    <div id="daily-tasks-list" class="rh-list-container">加载中...</div>
                </div>

                <div id="rh-pane-terms" class="rh-tab-pane">
                    <div class="rh-section-title" style="margin-top:0;">搜索词库</div>
                    <div id="rewards-search-terms-container" class="rh-list-container" style="max-height: 180px;">
                        <div style="font-weight: 600; color: var(--accent); margin-bottom: 2px;">主页面:</div>
                        <div id="main-search-terms" style="padding-left: 8px; margin-bottom: 6px; color: var(--text-sec);">无</div>
                        <div style="font-weight: 600; color: var(--accent); margin-bottom: 2px;">侧边栏:</div>
                        <div id="iframe-search-terms" style="padding-left: 8px; color: var(--text-sec);">无</div>
                    </div>
                </div>

                <div id="rh-pane-settings" class="rh-tab-pane">
                    <div class="rh-section-title" style="margin-top:0;">设置</div>
                    <div class="rh-config-grid">
                        <label for="rest-time">休息时间(分)</label>
                        <input type="number" id="rest-time" class="rh-input" value="${config.restTime / 60}" min="1" max="30">
                        
                        <label for="scroll-time">滚动时间(秒)</label>
                        <input type="number" id="scroll-time" class="rh-input" value="${config.scrollTime}" min="3" max="30">
                        
                        <label for="wait-time">间隔等待(秒)</label>
                        <input type="number" id="wait-time" class="rh-input" value="${config.waitTime}" min="3" max="30">
                        
                        <label for="max-no-progress">容错次数</label>
                        <input type="number" id="max-no-progress" class="rh-input" value="${config.maxNoProgressCount}" min="1" max="10">
                    </div>
                </div>
            </div>

            <div style="margin-top: 10px;">
                <button id="start-search-btn" class="rh-btn">🚀 开始自动搜索</button>
            </div>

        `;

        document.body.appendChild(container);
        makeDraggable(container, container.querySelector('.rh-header'));

        // Event Listeners
        document.getElementById('close-btn').onclick = () => container.style.display = 'none';
        document.getElementById('minimize-btn').onclick = toggleCollapse;
        
        document.getElementById('start-search-btn').onclick = function () {
            if (!isSearching) startAutomatedSearch();
            else stopAutomatedSearch();
        };

        // Tab Listeners
        const tabs = container.querySelectorAll('.rh-tab');
        const panes = container.querySelectorAll('.rh-tab-pane');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                panes.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById(tab.getAttribute('data-target'));
                if (target) target.classList.add('active');
            };
        });

        // Config Listeners
        const bindConfig = (id, key, multiplier = 1, defaultVal) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    config[key] = (parseInt(el.value) || defaultVal) * multiplier;
                    saveConfig();
                    updateStatus(el.previousElementSibling.textContent + '已更新');
                });
            }
        };
        bindConfig('rest-time', 'restTime', 60, 5);
        bindConfig('scroll-time', 'scrollTime', 1, 10);
        bindConfig('wait-time', 'waitTime', 1, 10);
        bindConfig('max-no-progress', 'maxNoProgressCount', 1, 3);
    }

    function applyCollapseState() {
        const content = document.getElementById('rewards-helper-content');
        const minimizeBtn = document.getElementById('minimize-btn');
        const miniStatus = document.getElementById('always-visible-status');

        if (searchState.isCollapsed) {
            if (content) content.classList.add('collapsed');
            if (miniStatus) miniStatus.style.display = 'block';
            if (minimizeBtn) minimizeBtn.textContent = '+';
        } else {
            if (content) content.classList.remove('collapsed');
            if (miniStatus) miniStatus.style.display = 'none';
            if (minimizeBtn) minimizeBtn.textContent = '−';
        }
    }

    function updateStatus(message) {
        const statusElement = document.getElementById('search-status');
        const miniStatusElement = document.getElementById('search-status-mini');
        if (statusElement) statusElement.textContent = message;
        if (miniStatusElement) miniStatusElement.textContent = message;
        console.log(message);
    }

    function updateCountdown(seconds, action) {
        const countdownElement = document.getElementById('countdown');
        const miniStatusElement = document.getElementById('search-status-mini');
        
        if (seconds > 0) {
            let actionText = '';
            switch (action) {
                case 'scrolling': actionText = '滚动中'; break;
                case 'waiting': actionText = '等待中'; break;
                case 'resting': actionText = '休息中'; break;
                case 'checking': actionText = '检查中'; break;
                default: actionText = '倒计时';
            }
            const text = `${actionText}: ${seconds}秒`;
            if (countdownElement) {
                countdownElement.textContent = text;
                countdownElement.style.display = 'block';
            }
            if (searchState.isCollapsed && miniStatusElement) {
                miniStatusElement.textContent = text;
            }
        } else {
            if (countdownElement) countdownElement.style.display = 'none';
            if (searchState.isCollapsed && miniStatusElement) {
                miniStatusElement.textContent = document.getElementById('search-status')?.textContent || '就绪';
            }
        }
    }

export { injectStyles, createUI, applyCollapseState, updateStatus, updateCountdown, showCompletionNotification, updateTaskProgress };
