// @ts-nocheck
import { config } from './config';
import { store } from './state';
export function init() {


    // skip running inside iframes (e.g. rewards sidebar)
    if (window !== window.top) return;

    // 存储搜索词和当前进度
    let mainPageSearchTerms = []; // 主页面搜索词
    let iframeSearchTerms = []; // iframe搜索词
    let usedSearchTerms = []; // 已使用的搜索词
    let dailyTasksData = []; // 每日点击任务数据
    let currentProgress = {
        current: 0,
        total: 0,
        lastChecked: 0, // 上次检查时的进度
        completed: false, // 任务是否已完成
        noProgressCount: 0 // 连续未增加进度的次数
    };
    let isSearching = false;
    let countdownTimer = null;

    // 保底搜索词 (扩充版)
    const fallbackSearchTerms = [
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

    // 配置参数
    

    // 工作状态
    const searchState = store.searchState;

    // 本地存储键名
    const STORAGE_KEY = 'bing_rewards_auto_searcher_state';
    const CONFIG_STORAGE_KEY = 'bing_rewards_config';

    // 辅助函数: 延迟
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ---------------------------------------------------------
    // 新增工具：智能等待元素，替代固定 sleep
    // ---------------------------------------------------------
    async function waitForElement(selector, timeout = 5000, context = document) {
        let el = context.querySelector(selector);
        if (el) return el;
        return new Promise(resolve => {
            const observer = new MutationObserver((mutations, obs) => {
                const el = context.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });
            observer.observe(context.body || context, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // ---------------------------------------------------------
    // 新增工具：模拟真实鼠标轨迹和点击前摇
    // ---------------------------------------------------------
    async function simulateMouseInteraction(element) {
        if (!element) return;
        try {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const targetX = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
            const targetY = rect.top + rect.height / 2 + (Math.random() * 10 - 5);
            
            element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
            await sleep(100 + Math.random() * 200);
            element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
            await sleep(50 + Math.random() * 100);
        } catch (e) {}
    }

    // ---------------------------------------------------------
    // 新增工具：动态词库抓取 (通过维基百科随机API获取纯有机词汇)
    // ---------------------------------------------------------
    let dynamicSearchTerms = [];
    async function fetchOrganicSearchTerms() {
        try {
            const url = 'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=15&format=json&origin=*';
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.query && data.query.random) {
                console.log('[RewardsHelper] 成功获取动态词库');
                return data.query.random.map(page => page.title);
            }
        } catch (e) {
            console.error('[RewardsHelper] 获取动态词库失败', e);
        }
        return [];
    }


    // 辅助函数: 获取随机搜索间隔
    function getRandomInterval() {
        const min = config.searchInterval[0] || 5;
        const max = config.searchInterval[1] || 10;
        return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    }

    // detect dark mode - prioritize Bing's own setting over system
    function isDarkMode() {
        const html = document.documentElement;
        // Bing uses b_dark class or data-darkmode attribute
        if (html.classList.contains('b_dark') || document.body.classList.contains('b_dark')) return true;
        if (html.getAttribute('data-darkmode') === 'true') return true;
        // if Bing page is loaded, trust its class (no b_dark = light mode)
        if (document.body) return false;
        // fallback to system setting only if page not ready
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // color theme
    function getTheme() {
        const dark = isDarkMode();
        return {
            bg: dark ? '#2d2d2d' : '#fff',
            border: dark ? '#444' : '#ddd',
            text: dark ? '#e0e0e0' : '#333',
            textSecondary: dark ? '#aaa' : '#666',
            inputBg: dark ? '#3a3a3a' : '#fff',
            inputBorder: dark ? '#555' : '#ccc',
            accent: '#0078d4',
            accentDanger: '#d83b01',
        };
    }

    // save config to localStorage
    function saveConfig() {
        try {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({
                restTime: config.restTime,
                scrollTime: config.scrollTime,
                waitTime: config.waitTime,
                maxNoProgressCount: config.maxNoProgressCount,
                isCollapsed: searchState.isCollapsed
            }));
        } catch (e) { /* ignore */ }
    }

    // load config from localStorage
    function loadConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (saved) {
                const c = JSON.parse(saved);
                if (c.restTime) config.restTime = c.restTime;
                if (c.scrollTime) config.scrollTime = c.scrollTime;
                if (c.waitTime) config.waitTime = c.waitTime;
                if (c.maxNoProgressCount) config.maxNoProgressCount = c.maxNoProgressCount;
                if (c.isCollapsed !== undefined) searchState.isCollapsed = c.isCollapsed;
            }
        } catch (e) { /* ignore */ }
    }

    // load saved config on startup
    loadConfig();

    // 保存状态到localStorage
    function saveState() {
        const state = {
            isSearching: isSearching,
            currentProgress: currentProgress,
            usedSearchTerms: usedSearchTerms,
            searchStartTime: Date.now(),
            lastActivityTime: Date.now(),
            mainPageSearchTerms,
            iframeSearchTerms,
            dailyTasksQueue: searchState.dailyTasksQueue,
            timestamp: new Date().getTime()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log('状态已保存到本地存储');
        } catch (e) {
            console.log('保存状态失败:', e.message);
        }
    }

    // 从localStorage加载状态
    function loadState() {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (savedState) {
                const state = JSON.parse(savedState);
                const timeSinceLastActivity = Date.now() - (state.lastActivityTime || 0);
                const maxInactiveTime = 5 * 60 * 1000; // 5分钟

                // 如果超过5分钟未活动，清除状态
                if (timeSinceLastActivity > maxInactiveTime) {
                    console.log('状态已过期，清除本地存储');
                    clearState();
                    return null;
                }

                console.log('从本地存储加载状态:', state);
                return state;
            }
        } catch (e) {
            console.log('加载状态失败:', e.message);
        }
        return null;
    }

    // 清除localStorage中的状态
    function clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('已清除本地存储状态');
        } catch (e) {
            console.log('清除状态失败:', e.message);
        }
    }

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
    // 让UI窗口可拖动
    function makeDraggable(container, header) {
        let offsetX, offsetY;
        let isDragging = false;

        const onMouseDown = (e) => {
            // 如果点击的是按钮（它们有自己的pointer光标），则不触发拖动
            if (window.getComputedStyle(e.target).cursor === 'pointer') {
                return;
            }

            isDragging = true;

            // switch from bottom/right positioning to top/left for dragging
            if (container.style.bottom || container.style.right) {
                const rect = container.getBoundingClientRect();
                container.style.left = rect.left + 'px';
                container.style.top = rect.top + 'px';
                container.style.right = '';
                container.style.bottom = '';
            }

            offsetX = e.clientX - container.offsetLeft;
            offsetY = e.clientY - container.offsetTop;

            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp, { once: true }); // Use {once: true} for cleanup
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            let newTop = e.clientY - offsetY;
            let newLeft = e.clientX - offsetX;

            // 边界约束限制
            const rect = container.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            container.style.top = newTop + 'px';
            container.style.left = newLeft + 'px';
        };

        const onMouseUp = () => {
            isDragging = false;
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
        };

        header.addEventListener('mousedown', onMouseDown);
    }

    // 更新状态显示
    function updateStatus(message) {
        const statusElement = document.getElementById('search-status');
        const miniStatusElement = document.getElementById('search-status-mini');
        if (statusElement) statusElement.textContent = message;
        if (miniStatusElement) miniStatusElement.textContent = message;
        console.log(message);
    }

    function toggleCollapse() {
        searchState.isCollapsed = !searchState.isCollapsed;
        applyCollapseState();
        saveConfig();
    }

    // 应用折叠状态
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

    // 更新倒计时显示
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

    // 更新每日点击任务 UI
    function updateDailyTasksUI(tasks) {
        const tasksList = document.getElementById('daily-tasks-list');
        if (!tasksList) return;

        const summaryElem = document.getElementById('daily-tasks-summary');
        tasksList.innerHTML = '';

        // 生成 summary 图标
        let summaryIcons = '';
        if (!tasks || tasks.length === 0) {
            summaryIcons = '✅✅✅';
        } else {
            summaryIcons = tasks
                .map(t => (t.status === '已完成' ? '✅' : t.status === '未完成' ? '❌' : '❔'))
                .join('');
        }

        if (summaryElem) {
            summaryElem.textContent = `每日任务 ${summaryIcons}`;
        }

        // 详细列表
        if (!tasks || tasks.length === 0) {
            tasksList.innerHTML = '<div style="color: #4CAF50; font-weight: 500;">每日任务已全部完成</div>';
            return;
        }

        tasks.forEach(task => {
            const taskElem = document.createElement('div');
            taskElem.style.display = 'flex';
            taskElem.style.justifyContent = 'space-between';
            taskElem.style.marginBottom = '2px';
            taskElem.style.color = task.status === '未完成' ? 'var(--accent-danger)' : '#4CAF50';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `• ${task.name}`;
            nameSpan.style.whiteSpace = 'nowrap';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            nameSpan.style.marginRight = '8px';
            
            const statusSpan = document.createElement('span');
            statusSpan.textContent = task.status;
            statusSpan.style.flexShrink = '0';
            
            taskElem.appendChild(nameSpan);
            taskElem.appendChild(statusSpan);
            tasksList.appendChild(taskElem);
        });
    }


    // 新增：关闭侧边栏，防止长时间挂起导致 Bing React 崩溃
    async function closeRewardsSidebarAsync() {
        try {
            const iframe = document.querySelector('iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout');
            if (iframe) {
                const pointsContainer = document.querySelector('.points-container, #id_rc, #rewards-badge');
                if (pointsContainer) {
                    pointsContainer.click();
                    console.log('已点击积分按钮，关闭侧边栏');
                }
            }
        } catch(e) {}
    }

    // 点击打开侧边栏
    async function openRewardsSidebarAsync() {
        const pointsContainer = await waitForElement('.points-container, #id_rc, #rewards-badge', 3000);
        if (pointsContainer) {
            // await simulateMouseInteraction(pointsContainer); // Disabled due to React #152 error
            pointsContainer.click();
            console.log('已点击积分按钮，正在打开侧边栏...');
            return true;
        } else {
            console.log('未找到积分按钮');
            return false;
        }
    }

    // 从奖励面板中获取数据 (iframe或主DOM)
    function getDataFromPanel() {
        let targetDoc = document;
        let isIframe = false;
        let iframeWin = window;

        const iframe = document.querySelector('iframe[src*="rewards/panelflyout"]') || document.querySelector('iframe#b_rwFlyout') || document.querySelector('iframe.b_rwFlyout');
        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc && iframeDoc.readyState === 'complete') {
                    targetDoc = iframeDoc;
                    isIframe = true;
                    iframeWin = iframe.contentWindow;
                    console.log('成功访问iframe文档');
                }
            } catch (e) {
                console.log('访问iframe文档失败:', e.message);
            }
        } else {
            console.log('未找到iframe，尝试从主文档获取数据');
        }

        try {
            // 解析并抓取所有任务（包括每日任务和“在必应上浏览”任务）
            (() => {
                const tasks = [];
                const cardsArray = new Set();
                
                // 1. 传统类名查找
                targetDoc.querySelectorAll('div[aria-label*="Offer"], .promo_cont, .rw-card, .explore-card, .task-card').forEach(el => cardsArray.add(el));
                
                // 2. 积分徽章查找 (寻找包含 "+ 10", "+5" 等的元素)
                try {
                    const textNodes = targetDoc.createTreeWalker(targetDoc.body || targetDoc, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while ((node = textNodes.nextNode())) {
                        const t = node.nodeValue.trim();
                        if (/^\+\s*\d+$/.test(t)) {
                            let parent = node.parentElement;
                            if (parent) {
                                let card = parent.closest('a, li, [role="button"], [class*="card"], [class*="item"], .promo_cont, div[tabindex]');
                                if (card) cardsArray.add(card);
                            }
                        }
                    }
                } catch(e) {}

                // 去除嵌套的卡片，并过滤掉非标准任务卡片
                const finalCards = Array.from(cardsArray).filter(card => {
                    for (let other of cardsArray) {
                        if (other !== card && other.contains(card)) {
                            // console.log(`[RewardsHelper] 剔除嵌套卡片`);
                            return false;
                        }
                    }
                    
                    const link = card.tagName.toLowerCase() === 'a' ? card : card.querySelector('a');
                    const href = link ? (link.getAttribute('href') || '').toLowerCase() : '';
                    const ariaLabel = card.getAttribute('aria-label') || '';
                    
                    // 核心过滤条件：检测任务卡片的跳转链接必须带有bing搜索词的链接，或者特殊的用户追踪任务链接
                    if (!href.includes('search?q=') && !href.includes('/rewards/checkuser')) {
                        console.log(`[RewardsHelper] 剔除卡片 (无有效搜索链接): aria="${ariaLabel}", href="${href.substring(0, 40)}"`);
                        return false;
                    }
                    
                    let points = 0;
                    
                    // 1. 优先尝试从专门显示积分的标签提取
                    const pointEl = card.querySelector('.point, .shortPoint, [class*="point"]');
                    if (pointEl) {
                        const pAria = pointEl.getAttribute('aria-label') || '';
                        const pText = pointEl.textContent || '';
                        const match = pAria.match(/(\d+)/) || pText.match(/(\d+)/);
                        if (match) points = parseInt(match[1], 10);
                    }
                    
                    // 2. 备用方式：从卡片全局文本提取
                    if (points === 0) {
                        const text = (card.textContent || '').toLowerCase();
                        const pointsMatch = text.match(/\+\s*(\d+)/) || text.match(/\b(\d+)\s*(?:pts|points|分)\b/);
                        if (pointsMatch) {
                            points = parseInt(pointsMatch[1], 10);
                        }
                    }
                    
                    // 根据用户要求：剔除能获取积分 >= 50 的任务
                    if (points >= 50) {
                        console.log(`[RewardsHelper] 剔除卡片 (高分非日常任务): 分数=${points}, aria="${ariaLabel}"`);
                        return false;
                    }
                    
                    return true;
                });

                console.log('[RewardsHelper] ======== 开始每日任务卡片解析 ========');
                console.log('[RewardsHelper] 全局扫描找到任务卡片数量:', finalCards.length);

                finalCards.forEach((div, idx) => {
                    const ariaLabel = div.getAttribute('aria-label') || '';
                    const html = div.innerHTML || '';
                    const text = div.textContent || '';
                    
                    console.log(`\n[RewardsHelper] --- 正在分析第 ${idx + 1} 个卡片 ---`);
                    console.log(`[RewardsHelper] 元素类型: ${div.tagName}`);
                    console.log(`[RewardsHelper] aria-label: "${ariaLabel}"`);
                    console.log(`[RewardsHelper] 卡片文本: "${text.replace(/\s+/g, ' ').substring(0, 60).trim()}..."`);
                    
                    let name = '';
                    let status = '未知';

                    // 根据用户要求：优先使用卡片的 aria-label 作为任务名称
                    if (ariaLabel) {
                        if (ariaLabel.includes(' - ')) {
                            name = ariaLabel.split(' - ')[0];
                        } else {
                            name = ariaLabel;
                        }
                    }
                    
                    // 如果 aria-label 为空，再尝试从内部元素提取
                    if (!name) {
                        const titleElem = div.querySelector('h3, h4, .title, .rw-card-title, .promo_title, .card-title, div[class*="title"], img[alt]');
                        if (titleElem && titleElem.tagName.toLowerCase() === 'img') {
                            name = titleElem.getAttribute('alt') || '';
                        } else if (titleElem && titleElem.textContent.trim()) {
                            name = titleElem.textContent.trim();
                        }
                        
                        if (!name) {
                            const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^\+?\s*\d+\s*(分|points?)?$/i.test(l));
                            if (lines.length > 0) {
                                name = lines[0];
                            } else {
                                name = `任务${idx + 1}`;
                            }
                        }
                    }

                    let pAriaLower = '';
                    const pointEl = div.querySelector('.point, .shortPoint, [class*="point"]');
                    if (pointEl) {
                        pAriaLower = (pointEl.getAttribute('aria-label') || '').toLowerCase();
                    }

                    const ariaLower = ariaLabel.toLowerCase();
                    
                    // 1. 优先使用最精准的积分徽标 pAria 判断
                    if (pAriaLower.includes('添加') || pAriaLower.includes('added')) {
                        status = '已完成';
                        console.log(`[RewardsHelper] 状态推断: 已完成 (积分徽标特征)`);
                    } else if (pAriaLower.includes('积分') || pAriaLower.includes('points')) {
                        status = '未完成';
                        console.log(`[RewardsHelper] 状态推断: 未完成 (积分徽标特征)`);
                    } 
                    // 2. 其次使用大卡片的 aria-label 判断 (注意：必须先检测 not completed)
                    else if (ariaLower.includes('not completed') || ariaLower.includes('未完成')) {
                        status = '未完成';
                        console.log(`[RewardsHelper] 状态推断: 未完成 (卡片aria特征)`);
                    } else if (ariaLower.includes('is completed') || ariaLower.includes('completed') || ariaLower.includes('已完成')) {
                        status = '已完成';
                        console.log(`[RewardsHelper] 状态推断: 已完成 (卡片aria特征)`);
                    } else {
                        const hasCheck = /check|completed|已完成/i.test(html) || /已完成/.test(text);
                        const hasAdd = /add|plus/i.test(html) || /未完成/.test(text) || /^\+\s*\d+/.test(text) || html.includes('+');
                        if (hasCheck && !hasAdd) {
                            status = '已完成';
                            console.log(`[RewardsHelper] 状态推断 (html/text特征): 已完成 (包含完成标记且无+号)`);
                        } else {
                            status = '未完成';
                            console.log(`[RewardsHelper] 状态推断 (html/text特征): 未完成 (有+号或无完成标记)`);
                        }
                    }

                    name = name.replace(/icon\s*$/i, '').trim();
                    if (/^\+?\s*\d+\s*(分|points?)?$/i.test(name)) name = `任务${idx + 1}`;
                    if (name.length > 25) name = name.substring(0, 25) + '...';
                    
                    console.log(`[RewardsHelper] 最终结果 -> 任务名: "${name}", 状态: "${status}"`);
                    
                    tasks.push({ name, status });
                });

                console.log('\n[RewardsHelper] ======== 任务卡片解析结束 ========');
                console.log('[RewardsHelper] 解析出的最终任务列表:', tasks);

                updateDailyTasksUI(tasks);
                dailyTasksData = tasks;
            })();

            // 获取进度 - 优先检查实际进度，再检查完成提示
            // 1. 首先尝试获取正常进度显示
            let progressFound = false;
            let currentBestProgress = null;
            let currentBestMax = 0;

            let potentialProgresses = [];
            const allElements = targetDoc.querySelectorAll('span, div, p');
            for (let el of allElements) {
                const txt = (el.textContent || '').trim();
                if (txt.length > 0 && txt.length < 50) {
                    const matches = txt.match(/(\d+)\s*\/\s*(\d+)/);
                    if (matches) {
                        const cur = parseInt(matches[1], 10);
                        const max = parseInt(matches[2], 10);
                        if (max >= 12 && max <= 300 && max !== 100 && !txt.toLowerCase().includes('min') && !txt.toLowerCase().includes('level') && !txt.includes('级')) {
                            
                            // 获取上下文文本（向上3级父元素）以判断是不是“搜索”进度
                            let parent = el.parentElement;
                            let contextText = txt;
                            let upCount = 0;
                            while (parent && upCount < 3) {
                                contextText += ' ' + (parent.textContent || '');
                                parent = parent.parentElement;
                                upCount++;
                            }
                            contextText = contextText.toLowerCase();

                            // 排除明显的“非搜索”任务
                            if (contextText.includes('浏览') || contextText.includes('browse') || 
                                contextText.includes('阅读') || contextText.includes('read')) {
                                continue;
                            }

                            const isSearch = contextText.includes('搜索') || contextText.includes('search') || contextText.includes('pc');
                            potentialProgresses.push({ current: cur, max: max, isSearch });
                        }
                    }
                }
            }

            if (potentialProgresses.length > 0) {
                let best = null;
                // 优先选取明确包含搜索字眼的进度
                const searchProgresses = potentialProgresses.filter(p => p.isSearch);
                if (searchProgresses.length > 0) {
                    best = searchProgresses.reduce((prev, curr) => (prev.max > curr.max) ? prev : curr);
                } else {
                    // 如果没有明确搜索字眼，排除 max=80 (常见于“在必应上浏览”被漏掉的情况)
                    let filtered = potentialProgresses.filter(p => p.max !== 80);
                    if (filtered.length > 0) {
                        best = filtered.reduce((prev, curr) => (prev.max > curr.max) ? prev : curr);
                    } else {
                        best = potentialProgresses.reduce((prev, curr) => (prev.max > curr.max) ? prev : curr);
                    }
                }
                currentBestProgress = best;
            }

            if (currentBestProgress) {
                const current = currentBestProgress.current;
                currentProgress.total = currentBestProgress.max;

                document.getElementById('rewards-progress').textContent = '进度: ' + current + '/' + currentProgress.total;
                console.log('搜索进度: ' + current + '/' + currentProgress.total);

                // 检查进度是否增加
                if (currentProgress.lastChecked > 0 && current <= currentProgress.lastChecked && isSearching) {
                    console.log(`进度未增加: ${current} <= ${currentProgress.lastChecked}，已连续 ${currentProgress.noProgressCount + 1} 次未增加`);
                    currentProgress.noProgressCount++;

                    // 只有当连续多次未增加进度时才休息
                    if (currentProgress.noProgressCount >= config.maxNoProgressCount) {
                        searchState.needRest = true;
                        console.log(`达到最大容错次数 ${config.maxNoProgressCount}，需要休息`);
                    }
                } else if (current > currentProgress.lastChecked) {
                    // 进度增加，重置计数器
                    console.log(`进度增加: ${current} > ${currentProgress.lastChecked}，重置未增加计数`);
                    currentProgress.noProgressCount = 0;
                }

                currentProgress.current = current;
                currentProgress.lastChecked = current;

                // 检查是否完成
                if (current >= currentProgress.total) {
                    currentProgress.completed = true;
                    console.log(`进度数字表明任务已完成: ${current}/${currentProgress.total}`);
                }

                // 保存状态
                updateAndSaveState();
                progressFound = true;
            } else {
                console.log('未找到进度元素，检查完成提示');
            }

            // 2. 只有在没有找到进度元素时，才检查完成提示和假提示
            if (!progressFound) {
                const allEarnedText = targetDoc.body ? (targetDoc.body.innerText || targetDoc.body.textContent || '') : '';
                console.log('合并后的提示文本提取完毕');

                const progressRules = [
                    {
                        type: 'fake_zh',
                        match: /你已获得\s*(\d+)\s*积分.*每天继续搜索并获得最多\s*(\d+)/,
                        completed: false
                    },
                    {
                        type: 'real_zh',
                        match: /你已获得\s*(\d+)\s*积分(?!.*每天继续搜索)/,
                        completed: true
                    },
                    {
                        type: 'fake_en',
                        match: /You earned\s*(\d+)\s*points?(?:\s+already)?.*(?:earn\s+up\s+to|get\s+up\s+to)\s*(\d+)/i,
                        completed: false
                    },
                    {
                        type: 'real_en',
                        match: /You earned\s*(\d+)\s*points already(?!.*Keep searching)/i,
                        completed: true
                    }
                ];

                for (const rule of progressRules) {
                    const match = allEarnedText.match(rule.match);
                    if (match) {
                        console.log(`匹配到规则: ${rule.type}`);
                        const currentPoints = parseInt(match[1]);
                        const totalPoints = rule.completed ? currentPoints : parseInt(match[2]);
                        
                        currentProgress.current = currentPoints;
                        currentProgress.total = totalPoints;
                        currentProgress.lastChecked = currentPoints;
                        currentProgress.completed = rule.completed;
                        
                        const statusStr = rule.completed ? '(已完成)' : '(从提示获取)';
                        const progressElem = document.getElementById('rewards-progress');
                        if (progressElem) {
                            progressElem.textContent = `进度: ${currentPoints}/${totalPoints} ${statusStr}`;
                        }
                        
                        if (rule.completed) {
                            clearState();
                        } else {
                            updateAndSaveState();
                        }
                        return true;
                    }
                }
            } // end if (!progressFound)

            // 获取面板中的搜索词
            let iframeTermsFound = false;

            // method 1: from window.flyoutViewModel variable
            try {
                if (iframeWin && iframeWin.flyoutViewModel) {
                    const vm = iframeWin.flyoutViewModel;
                    // try both paths: flyoutResult.suggestedSearches and suggestedSearches
                    const ss = (vm.flyoutResult && vm.flyoutResult.suggestedSearches) || vm.suggestedSearches;
                    if (ss && ss.suggestedItems) {
                        const terms = ss.suggestedItems.map(item => item.query).filter(q => q);
                        if (terms.length > 0) {
                            iframeSearchTerms = [...terms];
                            iframeTermsFound = true;
                            console.log('从flyoutViewModel变量找到侧边栏搜索词: ' + terms.length + '个');
                        }
                    }
                }
            } catch (e2) {
                console.log('从flyoutViewModel变量获取失败:', e2.message);
            }

            // method 2: parse flyoutViewModel JSON from script tags
            if (!iframeTermsFound) {
                try {
                    const scripts = targetDoc.querySelectorAll('script');
                    for (const script of scripts) {
                        const text = script.textContent || '';
                        const idx = text.indexOf('window.flyoutViewModel');
                        if (idx === -1) continue;
                        // find the opening brace
                        const braceStart = text.indexOf('{', idx);
                        if (braceStart === -1) continue;
                        // count braces to find the matching closing brace
                        let depth = 0;
                        let braceEnd = -1;
                        for (let k = braceStart; k < text.length; k++) {
                            if (text[k] === '{') depth++;
                            else if (text[k] === '}') { depth--; if (depth === 0) { braceEnd = k; break; } }
                        }
                        if (braceEnd === -1) continue;
                        try {
                            const viewModel = JSON.parse(text.substring(braceStart, braceEnd + 1));
                            const ss = (viewModel.flyoutResult && viewModel.flyoutResult.suggestedSearches) || viewModel.suggestedSearches;
                            if (ss && ss.suggestedItems) {
                                const terms = ss.suggestedItems
                                    .map(item => item.query).filter(q => q);
                                if (terms.length > 0) {
                                    iframeSearchTerms = [...terms];
                                    iframeTermsFound = true;
                                    console.log('从script标签解析找到iframe搜索词: ' + terms.length + '个');
                                }
                            }
                        } catch (parseErr) {
                            console.log('JSON解析失败:', parseErr.message);
                        }
                        break;
                    }
                } catch (e3) {
                    console.log('从script标签解析搜索词失败:', e3.message);
                }
            }

            // method 3: fallback to old DOM selector
            if (!iframeTermsFound) {
                const searchTermsContainer = targetDoc.querySelector('.ss_items_wrapper');
                if (searchTermsContainer) {
                    const terms = [];
                    const spans = searchTermsContainer.querySelectorAll('span');
                    spans.forEach(span => {
                        terms.push(span.textContent);
                    });
                    if (terms.length > 0) {
                        iframeSearchTerms = [...terms];
                        iframeTermsFound = true;
                        console.log('从DOM找到侧边栏搜索词: ' + terms.length + '个');
                    }
                }
            }

            // update sidebar terms UI
            if (iframeTermsFound) {
                const termsContainer = document.getElementById('iframe-search-terms');
                if (termsContainer) {
                    while (termsContainer.firstChild) termsContainer.removeChild(termsContainer.firstChild);
                    iframeSearchTerms.forEach(term => {
                        const termElem = document.createElement('span');
                        termElem.className = 'rh-term-tag';
                        termElem.textContent = term;
                        termsContainer.appendChild(termElem);
                    });
                }
            } else {
                console.log('所有方法均未找到侧边栏搜索词');
            }

            return progressFound || iframeTermsFound || (typeof dailyTasksData !== 'undefined' && dailyTasksData.length > 0);
        } catch (e) {
            console.log('读取面板内容出错: ' + e.message);
            return false;
        }
    }

    // 从主文档中获取搜索词
    function getSearchTermsFromMainDoc() {
        const terms = [];
        const currentQ = new URLSearchParams(window.location.search).get('q') || '';

        // method 1: new format - "深入了解" section with b_vList b_divsec
        document.querySelectorAll('.b_vList.b_divsec a[href*="/search?q="]').forEach(a => {
            const text = a.textContent.trim();
            if (text.length > 2 && text.length < 60 && text !== currentQ) {
                terms.push(text);
            }
        });

        // method 2: rslist links
        if (terms.length === 0) {
            document.querySelectorAll('.rslist a[href*="/search?q="]').forEach(a => {
                const text = a.textContent.trim();
                if (text.length > 2 && text.length < 60 && text !== currentQ) {
                    terms.push(text);
                }
            });
        }

        // method 3: old format - richrsrailsugwrapper
        if (terms.length === 0) {
            const suggestionsContainer = document.querySelector('.richrsrailsugwrapper');
            if (suggestionsContainer) {
                suggestionsContainer.querySelectorAll('.richrsrailsuggestion_text').forEach(el => {
                    terms.push(el.textContent.trim());
                });
            }
        }

        if (terms.length > 0) {
            // deduplicate
            mainPageSearchTerms = [...new Set(terms)];

            const termsContainer = document.getElementById('main-search-terms');
            if (termsContainer) {
                termsContainer.textContent = '';
                mainPageSearchTerms.forEach(term => {
                    const termElem = document.createElement('span');
                    termElem.className = 'rh-term-tag';
                    termElem.textContent = term;
                    termsContainer.appendChild(termElem);
                });
            }
            console.log('找到主页面搜索词: ' + mainPageSearchTerms.length + '个');
            return true;
        } else {
            console.log('未找到主页面搜索词');
            return false;
        }
    }

    // 如果没有任何搜索词，使用保底搜索词
    function ensureFallbackSearchTerms() {
        if (mainPageSearchTerms.length === 0 && iframeSearchTerms.length === 0) {
            mainPageSearchTerms = [...fallbackSearchTerms];

            // 更新 UI
            const termsContainer = document.getElementById('main-search-terms');
            if (termsContainer) {
                termsContainer.textContent = '';
                mainPageSearchTerms.forEach(term => {
                    const termElem = document.createElement('span');
                    termElem.className = 'rh-term-tag';
                    termElem.textContent = term;
                    termsContainer.appendChild(termElem);
                });
            }

            console.log('[RewardsHelper] 使用保底搜索词:', fallbackSearchTerms);
            updateStatus('使用保底搜索词启动');
            return true;
        }
        return false;
    }

    // 获取Rewards数据 (Promise 封装)
    async function getRewardsDataAsync(retryCount = 0, maxRetries = 3) {
        console.log(`[RewardsHelper] 核心数据加载开始 (尝试: ${retryCount+1}/${maxRetries+1})`);
        updateStatus('正在获取奖励数据...');
        if (!(await openRewardsSidebarAsync())) {
            if (retryCount < maxRetries) {
                updateStatus(`未找到积分按钮，正在重试 (${retryCount + 1}/${maxRetries})...`);
                await sleep(2000);
                return getRewardsDataAsync(retryCount + 1, maxRetries);
            }
            updateStatus('未找到积分按钮，请确保已登录');
            return false;
        }

        let attempts = 0;
        const maxAttempts = 15;
        
        while (attempts < maxAttempts) {
            attempts++;
            try {
                const panelLoaded = getDataFromPanel();
                const mainTermsLoaded = getSearchTermsFromMainDoc();

                if (!panelLoaded) {
                    if (attempts < maxAttempts) {
                        await sleep(1000);
                        continue;
                    } else if (!mainTermsLoaded) {
                        throw new Error('获取数据失败');
                    }
                }

                updateStatus('数据获取成功');
                updateAndSaveState();
                
                if (currentProgress.completed) {
                    updateStatus('搜索任务已完成！');
                    if (isSearching) {
                        showCompletionNotification();
                        stopAutomatedSearch();
                    }
                }
                return true;
            } catch (error) {
                if (attempts >= maxAttempts) {
                    if (retryCount < maxRetries) {
                        updateStatus(`获取数据失败，正在重试 (${retryCount + 1}/${maxRetries})...`);
                        await sleep(2000);
                        return getRewardsDataAsync(retryCount + 1, maxRetries);
                    }
                    updateStatus('获取数据失败，请手动重试');
                    return false;
                }
                await sleep(500);
            }
        }
    }
    // (Removed getRewardsData wrapper)

    // async 模拟滚动
    async function simulateScrollingAsync() {
        updateStatus('正在滚动页面...');
        searchState.currentAction = 'scrolling';
        
        const steps = config.scrollTime;
        
        for (let i = 0; i < steps; i++) {
            if (searchState.currentAction !== 'scrolling') break;
            updateCountdown(config.scrollTime - i, 'scrolling');
            
            const scrollAmount = Math.floor(Math.random() * 400) + 200;
            const scrollDirection = Math.random() > 0.2 ? 1 : -1; // 80% 向下，20% 向上
            window.scrollBy({ top: scrollAmount * scrollDirection, left: 0, behavior: 'smooth' });
            
            await sleep(1000);
        }
        updateCountdown(0, '');
    }

    // Async 倒计时辅助函数
    async function countdownAsync(seconds, action) {
        searchState.currentAction = action;
        searchState.countdown = seconds;
        
        while (searchState.countdown > 0 && isSearching) {
            updateCountdown(searchState.countdown, action);
            await sleep(1000);
            searchState.countdown--;
        }
        updateCountdown(0, '');
    }


    // 自动执行每日任务 (Async)
    async function executeDailyTasksAsync() {
        try {
            const iframe = document.querySelector('iframe');
            if (!iframe) return;
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            
            let cardsArray = new Set();
            
            iframeDoc.querySelectorAll('div[aria-label*="Offer"], .promo_cont, .rw-card, .explore-card, .task-card').forEach(el => cardsArray.add(el));
            try {
                const textNodes = iframeDoc.createTreeWalker(iframeDoc.body || iframeDoc, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while ((node = textNodes.nextNode())) {
                    if (/^\+\s*\d+$/.test(node.nodeValue.trim())) {
                        let parent = node.parentElement;
                        if (parent) {
                            let card = parent.closest('a, li, [role="button"], [class*="card"], [class*="item"], .promo_cont, div[tabindex]');
                            if (card) cardsArray.add(card);
                        }
                    }
                }
            } catch(e) {}

            const finalCards = Array.from(cardsArray).filter(card => {
                for (let other of cardsArray) {
                    if (other !== card && other.contains(card)) return false;
                }
                
                const link = card.tagName.toLowerCase() === 'a' ? card : card.querySelector('a');
                const href = link ? (link.getAttribute('href') || '').toLowerCase() : '';
                
                if (!href.includes('search?q=') && !href.includes('/rewards/checkuser')) {
                    return false;
                }
                
                let points = 0;
                
                const pointEl = card.querySelector('.point, .shortPoint, [class*="point"]');
                if (pointEl) {
                    const pAria = pointEl.getAttribute('aria-label') || '';
                    const pText = pointEl.textContent || '';
                    const match = pAria.match(/(\d+)/) || pText.match(/(\d+)/);
                    if (match) points = parseInt(match[1], 10);
                }
                
                if (points === 0) {
                    const text = (card.textContent || '').toLowerCase();
                    const pointsMatch = text.match(/\+\s*(\d+)/) || text.match(/\b(\d+)\s*(?:pts|points|分)\b/);
                    if (pointsMatch) {
                        points = parseInt(pointsMatch[1], 10);
                    }
                }
                
                if (points >= 50) {
                    return false;
                }
                
                return true;
            });

            let hasNewTasks = false;
            for (let i = 0; i < finalCards.length; i++) {
                const div = finalCards[i];
                const ariaLabel = div.getAttribute('aria-label') || '';
                const html = div.innerHTML || '';
                const text = div.textContent || '';
                
                let isCompleted = false;
                
                let pAriaLower = '';
                const pointEl = div.querySelector('.point, .shortPoint, [class*="point"]');
                if (pointEl) {
                    pAriaLower = (pointEl.getAttribute('aria-label') || '').toLowerCase();
                }

                const ariaLower = ariaLabel.toLowerCase();
                
                if (pAriaLower.includes('添加') || pAriaLower.includes('added')) {
                    isCompleted = true;
                } else if (pAriaLower.includes('积分') || pAriaLower.includes('points')) {
                    isCompleted = false;
                } else if (ariaLower.includes('not completed') || ariaLower.includes('未完成')) {
                    isCompleted = false;
                } else if (ariaLower.includes('is completed') || ariaLower.includes('completed') || ariaLower.includes('已完成')) {
                    isCompleted = true;
                } else {
                    const hasCheck = /check|completed|已完成/i.test(html) || /已完成/.test(text);
                    const hasAdd = /add|plus/i.test(html) || /未完成/.test(text) || /^\+\s*\d+/.test(text) || html.includes('+');
                    if (hasCheck && !hasAdd) {
                        isCompleted = true;
                    }
                }

                if (!isCompleted) {
                    const linkElem = div.tagName.toLowerCase() === 'a' ? div : div.querySelector('a');
                    const href = linkElem ? linkElem.getAttribute('href') : null;
                    if (href && !searchState.dailyTasksQueue.includes(href)) {
                        searchState.dailyTasksQueue.push(href);
                        hasNewTasks = true;
                    }
                }
            }
            
            if (hasNewTasks) {
                console.log(`[RewardsHelper] 已将 ${searchState.dailyTasksQueue.length} 个任务加入执行队列`);
            }
        } catch (e) {
            console.log('执行每日任务出错', e);
        }
    }

    // 获取下一个搜索词
    function getSearchTerm() {
        let availableTerms = [];
        let source = '';

        // 优先级：动态词库 > 侧边栏 > 主页面 > 保底
        if (dynamicSearchTerms.length > 0) {
            availableTerms = dynamicSearchTerms.filter(term => !usedSearchTerms.includes(term));
            if (availableTerms.length > 0) {
                source = '动态词库';
            }
        }

        if (availableTerms.length === 0 && iframeSearchTerms && iframeSearchTerms.length > 0) {
            availableTerms = iframeSearchTerms.filter(term => !usedSearchTerms.includes(term));
            if (availableTerms.length > 0) {
                source = '侧边栏';
            }
        }
        
        if (availableTerms.length === 0 && mainPageSearchTerms && mainPageSearchTerms.length > 0) {
            availableTerms = mainPageSearchTerms.filter(term => !usedSearchTerms.includes(term));
            if (availableTerms.length > 0) {
                source = '主页面';
            }
        }
        
        if (availableTerms.length === 0) {
            availableTerms = fallbackSearchTerms.filter(term => !usedSearchTerms.includes(term));
            source = '保底';
            // 如果连保底都用完了，清空已使用记录重新来
            if (availableTerms.length === 0) {
                usedSearchTerms = [];
                availableTerms = fallbackSearchTerms;
            }
        }

        if (availableTerms.length > 0) {
            // 随机选取一个词
            const randomIndex = Math.floor(Math.random() * availableTerms.length);
            const term = availableTerms[randomIndex];
            usedSearchTerms.push(term);
            return { term, source };
        }
        return null;
    }


    // 执行模拟搜索操作
    function performSearch(term) {
        try {
            // 尝试定位必应搜索框
            const searchBox = document.querySelector('input[name="q"]#sb_form_q') || document.querySelector('textarea[name="q"]#sb_form_q');
            const searchForm = document.querySelector('form#sb_form') || document.querySelector('form');
            const searchButton = document.querySelector('label[for="sb_form_go"]') || document.querySelector('input#sb_form_go') || document.querySelector('svg.search') || document.querySelector('.search.icon');

            if (searchBox && (searchForm || searchButton)) {
                // 如果找到搜索框，执行模拟输入
                console.log(`[RewardsHelper] 正在模拟输入: ${term}`);
                
                // 解决 React 16+ 劫持 value 属性导致 dispatchEvent 失效的问题
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
                const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
                const setter = searchBox.tagName.toLowerCase() === 'textarea' 
                                ? (nativeTextAreaValueSetter ? nativeTextAreaValueSetter.set : null)
                                : (nativeInputValueSetter ? nativeInputValueSetter.set : null);
                
                // 聚焦并清空输入框
                searchBox.focus();
                if (setter) {
                    setter.call(searchBox, '');
                } else {
                    searchBox.value = '';
                }
                searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                
                // 异步模拟逐字输入
                (async () => {
                    let currentVal = '';
                    await sleep(200); // 聚焦后稍作停顿
                    
                    for (let i = 0; i < term.length; i++) {
                        if (!isSearching) return;
                        
                        // 移除了手误逻辑，以防止触发 React #152 错误

                        currentVal += term[i];
                        if (setter) {
                            setter.call(searchBox, currentVal);
                        } else {
                            searchBox.value += term[i];
                        }
                        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                        await sleep(40 + Math.random() * 120);
                    }
                    
                    await sleep(300 + Math.random() * 500); // 输入完停顿一下
                    
                    if (!isSearching) return;
                    console.log(`[RewardsHelper] 提交搜索: ${term}`);
                    
                    // 派发一个回车事件作为辅助，有些前端框架监听回车
                    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                    await sleep(100);

                    if (searchButton && typeof searchButton.click === 'function') {
                        searchButton.click();
                    } else if (searchForm && typeof searchForm.submit === 'function') {
                        searchForm.submit();
                    } else {
                        // 兜底直接跳转
                        window.location.href = `https://www.bing.com/search?q=${encodeURIComponent(term)}`;
                    }
                })();
                return true;
            } else {
                // 找不到输入框，直接跳转
                console.log(`[RewardsHelper] 未找到输入框，直接跳转搜索: ${term}`);
                window.location.href = `https://www.bing.com/search?q=${encodeURIComponent(term)}`;
                return true;
            }
        } catch (e) {
            console.error('[RewardsHelper] 执行搜索失败:', e);
            return false;
        }
    }

    // async 核心搜索循环
    async function searchLoop() {
        console.log('[RewardsHelper] 核心搜索循环已启动');
        while (isSearching) {
            console.log(`[RewardsHelper] 当前进度: ${currentProgress.current}/${currentProgress.total} (状态: ${currentProgress.completed ? '完成' : '进行中'})`);
            // 计算还需要搜索的次数
            const remainingSearches = currentProgress.total - currentProgress.current;
            if (remainingSearches <= 0 || currentProgress.completed) {
                showCompletionNotification();
                updateStatus('搜索任务已完成！');
                stopAutomatedSearch();
                break;
            }

            // 更新搜索词
            updateStatus('获取最新搜索词...');
            getSearchTermsFromMainDoc();
            
            // 补充动态词库
            if (dynamicSearchTerms.length < 3) {
                updateStatus('正在补充动态词库(维基百科)...');
                const newTerms = await fetchOrganicSearchTerms();
                dynamicSearchTerms.push(...newTerms);
            }
            
            let searchTermObj = getSearchTerm();
            if (!searchTermObj) {
                updateStatus('没有可用的搜索词，获取数据...');
                const success = await getRewardsDataAsync();
                if (!success) {
                    updateStatus('获取数据失败，停止搜索');
                    stopAutomatedSearch();
                    break;
                }
                ensureFallbackSearchTerms();
                searchTermObj = getSearchTerm();
                if (!searchTermObj) {
                    updateStatus('无法获取搜索词，停止搜索');
                    stopAutomatedSearch();
                    break;
                }
            }

            const { term, source } = searchTermObj;
            updateStatus(`正在搜索: ${term} (${source}搜索词) [剩余:${remainingSearches}]`);
            
            if (performSearch(term)) {
                // 等待搜索结果稍微加载一下
                await sleep(2000);
                
                // 模拟滚动
                if (!isSearching) break;
                await simulateScrollingAsync();
                
                // 检查进度
                if (!isSearching) break;
                updateStatus('正在检查搜索进度...');
                searchState.currentAction = 'checking';
                if (await openRewardsSidebarAsync()) {
                    await waitForElement('iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout', 5000);
                    await sleep(2500 + Math.random() * 1000);
                    console.log('[RewardsHelper] 搜索完成，准备获取最新进度...');
                    getDataFromPanel();
                        getSearchTermsFromMainDoc();
                        await closeRewardsSidebarAsync();
                    
                    if (currentProgress.completed) {
                        showCompletionNotification();
                        updateStatus('搜索任务已完成！');
                        stopAutomatedSearch();
                        break;
                    }
                    
                    if (searchState.needRest) {
                        searchState.needRest = false;
                        currentProgress.noProgressCount = 0;
                        updateStatus(`连续 ${config.maxNoProgressCount} 次搜索无进度，休息 ${config.restTime / 60} 分钟后继续`);
                        await countdownAsync(config.restTime, 'resting');
                        updateStatus('休息结束，继续搜索');
                        await sleep(1000);
                        continue; // 继续下一次循环
                    }
                } else {
                    updateStatus('无法打开侧边栏检查进度');
                }
                
                // 随机等待下一次搜索
                if (!isSearching) break;
                updateStatus('等待下一次搜索...');
                const waitMs = getRandomInterval();
                await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
                
            } else {
                updateStatus('搜索失败，请检查网页状态');
                await sleep(3000);
            }
        }
    }

    // 开始自动搜索
    async function startAutomatedSearch() {
        console.log('[RewardsHelper] 请求开始自动搜索');
        if (mainPageSearchTerms.length === 0 && iframeSearchTerms.length === 0) {
            updateStatus('获取搜索词中...');
            await getRewardsDataAsync();
            ensureFallbackSearchTerms();
            if (mainPageSearchTerms.length === 0 && iframeSearchTerms.length === 0) {
                console.log('[RewardsHelper] 缺少搜索词字典，流程终止');
                alert('没有搜索词，无法开始搜索');
                return;
            }
        }
        
        console.log('[RewardsHelper] 准备工作就绪，启动后台任务');
        isSearching = true;
        searchState.needRest = false;
        currentProgress.noProgressCount = 0;
        usedSearchTerms = [];
        
        const btn = document.getElementById('start-search-btn');
        if (btn) {
            btn.textContent = '停止搜索';
            btn.style.backgroundColor = '#d83b01';
        }
        updateStatus('自动搜索已开始...');
        saveState();
        
        // 执行每日任务: 获取未完成任务并放入队列
        await executeDailyTasksAsync();
        
        if (searchState.dailyTasksQueue && searchState.dailyTasksQueue.length > 0) {
            updateStatus('正在执行面板任务...');
            const nextTaskUrl = searchState.dailyTasksQueue.shift();
            saveState(); // 保存弹出的队列状态
            window.location.href = nextTaskUrl;
            return;
        }
        
        // 如果没有卡片任务，直接启动搜索循环
        searchLoop();
    }


    // 恢复状态
    function restoreState() {
        const savedState = loadState();
        if (savedState && savedState.isSearching) {
            // 恢复变量状态
            currentProgress = savedState.currentProgress || currentProgress;
            usedSearchTerms = savedState.usedSearchTerms || [];
            mainPageSearchTerms = savedState.mainPageSearchTerms || [];
            iframeSearchTerms = savedState.iframeSearchTerms || [];

            // 更新UI显示
            if (currentProgress.current !== undefined && currentProgress.total !== undefined) {
                const progressText = currentProgress.completed ?
                    `进度: ${currentProgress.current}/${currentProgress.total} (已完成)` :
                    `进度: ${currentProgress.current}/${currentProgress.total}`;
                const progressElement = document.getElementById('rewards-progress');
                if (progressElement) {
                    progressElement.textContent = progressText;
                }
            }

            updateStatus('检测到之前的搜索任务，正在恢复...');

            // 延迟启动自动搜索，给页面时间初始化
            setTimeout(async () => {
                if (!currentProgress.completed) {
                    console.log('恢复搜索状态，继续之前的搜索任务');
                    isSearching = true;
                    const btn = document.getElementById('start-search-btn');
                    if (btn) {
                        btn.textContent = '停止搜索';
                        btn.style.backgroundColor = 'var(--accent-danger, #d83b01)';
                    }
                    
                    // 页面刷新后，先同步和检查上次操作的进度
                    if (!isSearching) return;
                    await simulateScrollingAsync();
                    
                    if (searchState.dailyTasksQueue && searchState.dailyTasksQueue.length > 0) {
                        updateStatus('正在执行面板任务...');
                        // 稍作停留让当前任务获取积分
                        await sleep(2000);
                        const nextTaskUrl = searchState.dailyTasksQueue.shift();
                        saveState();
                        window.location.href = nextTaskUrl;
                        return;
                    }
                    
                    if (!isSearching) return;
                    updateStatus('正在检查上次搜索进度...');
                    searchState.currentAction = 'checking';
                    if (await openRewardsSidebarAsync()) {
                        await waitForElement('iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout', 5000);
                        await sleep(2500 + Math.random() * 1000); // 延长等待以确保 Bing React 渲染
                        getDataFromPanel();
                        getSearchTermsFromMainDoc();
                        await closeRewardsSidebarAsync();
                        
                        if (currentProgress.completed) {
                            showCompletionNotification();
                            updateStatus('搜索任务已完成！');
                            stopAutomatedSearch();
                            return;
                        }
                        
                        if (searchState.needRest) {
                            searchState.needRest = false;
                            currentProgress.noProgressCount = 0;
                            updateStatus(`连续 ${config.maxNoProgressCount} 次无进度，休息 ${config.restTime / 60} 分后继续`);
                            await countdownAsync(config.restTime, 'resting');
                            updateStatus('休息结束，继续搜索');
                            await sleep(1000);
                        }
                    } else {
                        updateStatus('无法打开侧边栏检查进度');
                    }
                    
                    if (!isSearching) return;
                    updateStatus('等待下一次搜索...');
                    const waitMs = getRandomInterval();
                    await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
                    
                    if (isSearching) {
                        searchLoop();
                    }
                } else {
                    updateStatus('之前的搜索任务已完成');
                    clearState();
                }
            }, 3000);

            return true;
        }
        return false;
    }

    // 在关键操作时保存状态
    function updateAndSaveState() {
        if (isSearching) {
            saveState();
        }
    }

    // 停止自动搜索
    function stopAutomatedSearch() {
        // 清除倒计时
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }

        isSearching = false;
        searchState.currentAction = 'idle';
        searchState.needRest = false;
        searchState.dailyTasksQueue = []; // 重置任务队列
        currentProgress.noProgressCount = 0;  // 重置未增加计数
        usedSearchTerms = []; // 重置已使用搜索词列表
        updateCountdown(0, '');

        // 清除持久化状态
        clearState();

        document.getElementById('start-search-btn').textContent = '开始自动搜索';
        document.getElementById('start-search-btn').style.backgroundColor = '#0078d4';
        updateStatus('搜索已停止');
    }

    // 显示完成通知
    function showCompletionNotification() {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #0078d4;
            color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            z-index: 10001;
            text-align: center;
            font-size: 16px;
        `;
        const notifTitle = document.createElement('div');
        notifTitle.style.cssText = 'font-weight: bold; margin-bottom: 10px; font-size: 18px;';
        notifTitle.textContent = '任务完成！';
        notification.appendChild(notifTitle);

        const notifBody = document.createElement('div');
        notifBody.textContent = `已完成所有 ${currentProgress.total} 次搜索任务`;
        notification.appendChild(notifBody);

        const closeBtn2 = document.createElement('button');
        closeBtn2.id = 'notification-close';
        closeBtn2.textContent = '关闭';
        closeBtn2.style.cssText = 'margin-top: 15px; padding: 5px 15px; background-color: white; color: #0078d4; border: none; border-radius: 3px; cursor: pointer;';
        notification.appendChild(closeBtn2);
        document.body.appendChild(notification);

        // 添加关闭按钮事件
        document.getElementById('notification-close').addEventListener('click', function () {
            notification.remove();
        });

        // 10秒后自动关闭
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
            }
        }, 10000);
    }

    // 开始倒计时
    function startCountdown(seconds, action, callback) {
        // 清除现有倒计时
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }

        searchState.currentAction = action;
        searchState.countdown = seconds;

        updateCountdown(seconds, action);

        countdownTimer = setInterval(() => {
            searchState.countdown--;
            updateCountdown(searchState.countdown, action);

            if (searchState.countdown <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                if (callback) callback();
            }
        }, 1000);
    }

    function applyTheme() {
        const container = document.getElementById('rewards-helper-container');
        if (!container) return;
        if (isDarkMode()) {
            container.classList.add('dark-theme');
        } else {
            container.classList.remove('dark-theme');
        }
        
        // start button specific logic
        const btn = document.getElementById('start-search-btn');
        if (btn && !isSearching) {
            btn.style.backgroundColor = 'var(--accent)';
        }
    }
    
    // 页面刷新或卸载前，强制同步保存进度
    window.addEventListener('beforeunload', () => {
        if (isSearching) {
            saveState();
        }
    });

    // 在页面加载完成后初始化
    window.addEventListener('load', function () {
        console.log('Microsoft Rewards 助手已加载');
        createUI();
        // 初始应用折叠状态
        applyCollapseState();

        // watch for dark mode changes
        const observer = new MutationObserver(() => applyTheme());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-darkmode'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

        // 尝试恢复之前的搜索状态
        setTimeout(() => {
            const restored = restoreState();
            if (!restored) {
                // 如果没有恢复状态，正常获取数据
                setTimeout(() => {
                    getRewardsDataAsync();
                }, 1000);
            }
        }, 1000);
    });

}
init();
