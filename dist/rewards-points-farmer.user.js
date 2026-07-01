// ==UserScript==
// @name         Rewards Points Farmer
// @name:en      Rewards Points Farmer
// @namespace    veegn
// @version      1.3.1
// @description  自动完成 Microsoft Rewards 在必应（Bing）上的每日搜索任务，带有可配置的UI界面，模拟人工操作以提高安全性。目前最稳定的脚本，全自动完成电脑端90分任务。
// @description:en  Automatically completes Microsoft Rewards daily search tasks on Bing. Features a configurable UI and mimics human behavior for better safety.
// @author       veegn
// @match        *://*.bing.com/*
// @grant        none
// @run-at       document-end
// @license      MIT
// ==/UserScript==
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/config.ts
const config = { restTime: 5 * 60, scrollTime: 10, waitTime: 10, searchInterval: [5, 10], maxNoProgressCount: 3 };

;// ./src/state.ts

const STORAGE_KEY = 'bing_rewards_auto_searcher_state';
const CONFIG_KEY = 'bing_rewards_config';
class StateStore {
    constructor() {
        this.isSearching = false;
        this.usedSearchTerms = [];
        this.mainPageSearchTerms = [];
        this.iframeSearchTerms = [];
        this.dynamicSearchTerms = [];
        this.fallbackSearchTerms = [
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
        this.dailyTasksData = [];
        this.countdownTimer = null;
        this.currentProgress = {
            current: 0,
            total: 0,
            lastChecked: 0,
            completed: false,
            noProgressCount: 0
        };
        this.searchState = {
            currentAction: 'idle',
            countdown: 0,
            needRest: false,
            isCollapsed: true,
            dailyTasksQueue: [],
            attemptedTasks: []
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
            attemptedTasks: this.searchState.attemptedTasks,
            timestamp: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log('状态已保存到本地存储');
        }
        catch (e) {
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
        }
        catch (e) {
            console.log('加载状态失败:', e.message);
        }
        return null;
    }
    clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('已清除本地存储状态');
        }
        catch (e) {
            console.log('清除状态失败:', e.message);
        }
    }
    loadConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const c = JSON.parse(saved);
                if (c.restTime)
                    config.restTime = c.restTime;
                if (c.scrollTime)
                    config.scrollTime = c.scrollTime;
                if (c.waitTime)
                    config.waitTime = c.waitTime;
                if (c.maxNoProgressCount)
                    config.maxNoProgressCount = c.maxNoProgressCount;
                if (c.isCollapsed !== undefined)
                    this.searchState.isCollapsed = c.isCollapsed;
            }
        }
        catch (e) {
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
        }
        catch (e) {
            console.warn('保存配置失败:', e);
        }
    }
}
const store = new StateStore();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function getRandomInterval() {
    const min = config.searchInterval[0] || 5;
    const max = config.searchInterval[1] || 10;
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

;// ./src/dom.ts

async function waitForElement(selector, timeout = 5000, context = document) {
    let el = context.querySelector(selector);
    if (el)
        return el;
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
async function simulateMouseInteraction(element) {
    if (!element)
        return;
    try {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
            return;
        const targetX = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
        const targetY = rect.top + rect.height / 2 + (Math.random() * 10 - 5);
        element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
        await sleep(100 + Math.random() * 200);
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, screenX: targetX, screenY: targetY }));
        await sleep(50 + Math.random() * 100);
    }
    catch (e) {
        console.warn('模拟鼠标交互出错:', e);
    }
}
function isDarkMode() {
    const html = document.documentElement;
    if (html.classList.contains('b_dark') || document.body?.classList.contains('b_dark'))
        return true;
    if (html.getAttribute('data-darkmode') === 'true')
        return true;
    if (document.body)
        return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
async function closeRewardsSidebarAsync() {
    try {
        const iframe = document.querySelector('iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout');
        if (iframe) {
            const pointsContainer = document.querySelector('.points-container, #id_rc, #rewards-badge');
            if (pointsContainer) {
                pointsContainer.click();
                console.log('已点击积分按钮，关闭侧边栏');
                await sleep(1000);
            }
        }
    }
    catch (e) {
        console.warn('关闭侧边栏出错:', e);
    }
}
async function openRewardsSidebarAsync() {
    const pointsContainer = await waitForElement('.points-container, #id_rc, #rewards-badge', 3000);
    if (pointsContainer) {
        pointsContainer.click();
        console.log('已点击积分按钮，正在打开侧边栏...');
        return true;
    }
    else {
        console.log('未找到积分按钮');
        return false;
    }
}
/**
 * Wait for the rewards iframe to appear AND have meaningful content rendered.
 * Polls every 500ms. Returns the iframe element or null on timeout.
 */
async function waitForIframeContent(timeout = 10000) {
    const POLL_INTERVAL = 500;
    const MIN_CONTENT_LENGTH = 30; // iframe body must have at least this many chars
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const iframe = (document.querySelector('iframe[src*="rewards/panelflyout"]') ||
            document.querySelector('iframe#b_rwFlyout') ||
            document.querySelector('iframe.b_rwFlyout'));
        if (iframe) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc && (doc.readyState === 'complete' || doc.readyState === 'interactive')) {
                    const bodyText = (doc.body?.textContent || '').trim();
                    if (bodyText.length >= MIN_CONTENT_LENGTH) {
                        console.log(`[RewardsHelper] iframe 内容就绪 (${bodyText.length} 字符, 耗时 ${Date.now() - startTime}ms)`);
                        return iframe;
                    }
                }
            }
            catch (e) {
                // Cross-origin or not ready yet, keep polling
            }
        }
        await sleep(POLL_INTERVAL);
    }
    console.log(`[RewardsHelper] iframe 内容等待超时 (${timeout}ms)，尝试继续解析`);
    // Return the iframe anyway so the caller can still attempt to parse
    return (document.querySelector('iframe[src*="rewards/panelflyout"]') ||
        document.querySelector('iframe#b_rwFlyout') ||
        document.querySelector('iframe.b_rwFlyout'));
}
async function simulateTypingAndSearch(searchTerm) {
    try {
        const input = document.querySelector('input[name="q"], #sb_form_q');
        if (!input) {
            console.log('[RewardsHelper] 未找到搜索框，放弃模拟打字');
            return false;
        }
        await simulateMouseInteraction(input);
        input.focus();
        await sleep(100);
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(100);
        for (let i = 0; i < searchTerm.length; i++) {
            input.value += searchTerm[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(50 + Math.random() * 150);
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200 + Math.random() * 300);
        const searchBtn = document.querySelector('#search_icon, #sb_form_go');
        const searchForm = document.querySelector('#sb_form');
        if (searchBtn) {
            await simulateMouseInteraction(searchBtn);
            searchBtn.click();
            console.log('[RewardsHelper] 通过点击按钮提交搜索');
            return true;
        }
        else if (searchForm) {
            searchForm.submit();
            console.log('[RewardsHelper] 通过表单提交搜索');
            return true;
        }
        else {
            console.log('[RewardsHelper] 未找到搜索按钮或表单，使用键盘回车事件提交');
            const enterEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
            input.dispatchEvent(enterEvent);
            return true;
        }
    }
    catch (e) {
        console.warn('[RewardsHelper] 模拟打字出错:', e);
        return false;
    }
}

;// ./src/i18n.ts
let currentLocale = null;
function getLocale() {
    if (currentLocale)
        return currentLocale;
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh')) {
        currentLocale = 'zh';
    }
    else {
        currentLocale = 'en';
    }
    return currentLocale;
}
const messages = {
    zh: {
        ui: {
            init: "初始化...",
            statusInit: "状态: 正在初始化...",
            startFarming: "🚀 开始挂机",
            stopFarming: "⏹️ 停止挂机",
            dailyTasks: "📋 每日卡片任务",
            fetchingTasks: "正在获取任务...",
            searchProgress: "📈 搜索进度",
            statusPrefix: "状态: ",
            statusScrolling: "滚动中",
            statusWaiting: "等待中",
            statusResting: "休息中",
            statusChecking: "检查中",
            statusCountdown: "倒计时",
            completed: "✅ 完成"
        },
        status: {
            detectedPrev: "检测到之前的搜索任务，正在恢复...",
            prevCompleted: "之前的搜索任务已完成",
            executingPanel: "正在执行面板任务...",
            checkingProgress: "正在检查上次搜索进度...",
            failedSidebarCheck: "无法打开侧边栏检查进度",
            waitingNext: "等待下一次搜索...",
            browsing: "浏览页面中...",
            allCompleted: "🎉 搜索任务已完成！",
            allCompletedToast: (total) => `🎉 已完成所有 ${total} 次搜索任务！`,
            resting: (count, mins) => `连续 ${count} 次无进度，休息 ${mins} 分后继续`,
            restFinished: "休息结束，继续搜索",
            autoStarted: "自动搜索已开始...",
            alreadyCompleted: "任务已经完成，无需搜索",
            failedSidebarDirect: "无法打开侧边栏，尝试直接搜索",
            waitingProgress: "等待获取进度信息...",
            searchStopped: "搜索已停止",
            searching: (term) => `正在搜索: ${term}`
        },
        parser: {
            completed: "已完成",
            incomplete: "未完成",
            taskName: (idx) => `任务${idx}`,
            noTasks: "✅ 未发现每日卡片任务",
            allTasksDone: "✅ 每日卡片任务已全部完成！"
        }
    },
    en: {
        ui: {
            init: "Initializing...",
            statusInit: "Status: Initializing...",
            startFarming: "🚀 Start Farming",
            stopFarming: "⏹️ Stop Farming",
            dailyTasks: "📋 Daily Tasks",
            fetchingTasks: "Fetching tasks...",
            searchProgress: "📈 Search Progress",
            statusPrefix: "Status: ",
            statusScrolling: "Scrolling",
            statusWaiting: "Waiting",
            statusResting: "Resting",
            statusChecking: "Checking",
            statusCountdown: "Countdown",
            completed: "✅ Done"
        },
        status: {
            detectedPrev: "Detected previous task, resuming...",
            prevCompleted: "Previous search task completed",
            executingPanel: "Executing panel tasks...",
            checkingProgress: "Checking previous progress...",
            failedSidebarCheck: "Failed to open sidebar to check progress",
            waitingNext: "Waiting for next search...",
            browsing: "Browsing page...",
            allCompleted: "🎉 Search tasks completed!",
            allCompletedToast: (total) => `🎉 Completed all ${total} search tasks!`,
            resting: (count, mins) => `No progress for ${count} times, resting for ${mins} min`,
            restFinished: "Rest finished, resuming search",
            autoStarted: "Automated search started...",
            alreadyCompleted: "Tasks already completed, no need to search",
            failedSidebarDirect: "Failed to open sidebar, trying direct search",
            waitingProgress: "Waiting for progress info...",
            searchStopped: "Search stopped",
            searching: (term) => `Searching: ${term}`
        },
        parser: {
            completed: "Completed",
            incomplete: "Incomplete",
            taskName: (idx) => `Task ${idx}`,
            noTasks: "✅ No daily card tasks found",
            allTasksDone: "✅ Daily card tasks all completed!"
        }
    }
};
function t(category, key, ...args) {
    const locale = getLocale();
    const group = messages[locale][category];
    if (!group || !group[key]) {
        return `${category}.${key}`;
    }
    const value = group[key];
    if (typeof value === 'function') {
        return value(...args);
    }
    return value;
}

;// ./src/parser.ts




async function fetchOrganicSearchTerms() {
    try {
        const url = 'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=15&format=json&origin=*';
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.query && data.query.random) {
            console.log('[RewardsHelper] 成功获取动态词库');
            return data.query.random.map((page) => page.title);
        }
    }
    catch (e) {
        console.error('[RewardsHelper] 获取动态词库失败', e);
    }
    return [];
}
function getSearchTermsFromMainDoc() {
    const terms = [];
    const currentQ = new URLSearchParams(window.location.search).get('q') || '';
    document.querySelectorAll('.b_vList.b_divsec a[href*="/search?q="]').forEach(a => {
        const text = a.textContent?.trim() || '';
        if (text.length > 2 && text.length < 60 && text !== currentQ) {
            terms.push(text);
        }
    });
    if (terms.length === 0) {
        document.querySelectorAll('.rslist a[href*="/search?q="]').forEach(a => {
            const text = a.textContent?.trim() || '';
            if (text.length > 2 && text.length < 60 && text !== currentQ) {
                terms.push(text);
            }
        });
    }
    if (terms.length === 0) {
        const suggestionsContainer = document.querySelector('.richrsrailsugwrapper');
        if (suggestionsContainer) {
            suggestionsContainer.querySelectorAll('.richrsrailsuggestion_text').forEach(el => {
                terms.push(el.textContent?.trim() || '');
            });
        }
    }
    if (terms.length > 0) {
        store.mainPageSearchTerms = [...new Set(terms)];
        const termsContainer = document.getElementById('main-search-terms');
        if (termsContainer) {
            termsContainer.textContent = '';
            store.mainPageSearchTerms.forEach(term => {
                const termElem = document.createElement('span');
                termElem.className = 'rh-term-tag';
                termElem.textContent = term;
                termsContainer.appendChild(termElem);
            });
        }
        console.log('找到主页面搜索词: ' + store.mainPageSearchTerms.length + '个');
        return true;
    }
    else {
        console.log('未找到主页面搜索词');
        return false;
    }
}
// ========== Shared card parsing helpers ==========
function discoverCards(doc) {
    const cardsArray = new Set();
    doc.querySelectorAll('div[aria-label*="Offer"], .promo_cont, .rw-card, .explore-card, .task-card').forEach(el => cardsArray.add(el));
    try {
        const textNodes = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = textNodes.nextNode())) {
            const t = node.nodeValue?.trim() || '';
            if (/^\+\s*\d+$/.test(t)) {
                let parent = node.parentElement;
                if (parent) {
                    let card = parent.closest('a, li, [role="button"], [class*="card"], [class*="item"], .promo_cont, div[tabindex]');
                    if (card)
                        cardsArray.add(card);
                }
            }
        }
    }
    catch (e) {
        console.warn('扫描文本节点时出错:', e);
    }
    return cardsArray;
}
function filterCards(cardsArray) {
    return Array.from(cardsArray).filter(card => {
        for (let other of cardsArray) {
            if (other !== card && other.contains(card)) {
                return false;
            }
        }
        const link = card.tagName.toLowerCase() === 'a' ? card : card.querySelector('a');
        const href = link ? (link.getAttribute('href') || '').toLowerCase() : '';
        const ariaLabel = card.getAttribute('aria-label') || '';
        const isRelative = href.startsWith('/') && !href.startsWith('//');
        const isBingDomain = href.includes('.bing.com/') || href.startsWith('https://bing.com/');
        if (!isRelative && !isBingDomain && href !== '') {
            console.log(`[RewardsHelper] 剔除卡片 (跨域外链，会导致脚本终止): aria="${ariaLabel}", href="${href.substring(0, 40)}"`);
            return false;
        }
        let points = getCardPoints(card);
        if (points >= 50 || points <= 0) {
            console.log(`[RewardsHelper] 剔除卡片 (高分非日常任务): 分数=${points}, aria="${ariaLabel}"`);
            return false;
        }
        return true;
    });
}
function getCardPoints(card) {
    const rawText = (card.textContent || '').toLowerCase().replace(/\s+/g, '');
    if ((rawText.match(/\+\d+/g) || []).length >= 3) {
        return 0;
    }
    let points = 0;
    const pointEl = card.querySelector('.point, .shortPoint, [class*="point"]');
    if (pointEl) {
        const pAria = pointEl.getAttribute('aria-label') || '';
        const pText = pointEl.textContent || '';
        const match = pAria.match(/(\d+)/) || pText.match(/(\d+)/);
        if (match)
            points = parseInt(match[1], 10);
    }
    if (points === 0) {
        const text = (card.textContent || '').toLowerCase();
        const pointsMatch = text.match(/\+\s*(\d+)/) || text.match(/\b(\d+)\s*(?:pts|points|分)\b/);
        if (pointsMatch) {
            points = parseInt(pointsMatch[1], 10);
        }
    }
    return points;
}
function getCardCompletionStatus(card) {
    const ariaLabel = card.getAttribute('aria-label') || '';
    const html = card.innerHTML || '';
    const text = card.textContent || '';
    let pAriaLower = '';
    const pointEl = card.querySelector('.point, .shortPoint, [class*="point"]');
    if (pointEl) {
        pAriaLower = (pointEl.getAttribute('aria-label') || '').toLowerCase();
    }
    const ariaLower = ariaLabel.toLowerCase();
    if (pAriaLower.includes('添加') || pAriaLower.includes('added')) {
        return '已完成';
    }
    else if (pAriaLower.includes('积分') || pAriaLower.includes('points')) {
        return '未完成';
    }
    else if (ariaLower.includes('not completed') || ariaLower.includes('未完成')) {
        return '未完成';
    }
    else if (ariaLower.includes('is completed') || ariaLower.includes('completed') || ariaLower.includes('已完成')) {
        return '已完成';
    }
    else {
        const hasCheck = /check|completed|已完成/i.test(html) || /已完成/.test(text);
        const hasAdd = /add|plus/i.test(html) || /未完成/.test(text) || /^\+\s*\d+/.test(text) || html.includes('+');
        if (hasCheck && !hasAdd) {
            return '已完成';
        }
        return '未完成';
    }
}
function getDataFromPanel() {
    let targetDoc = document;
    let isIframe = false;
    let iframeWin = window;
    const iframe = (document.querySelector('iframe[src*="rewards/panelflyout"]') || document.querySelector('iframe#b_rwFlyout') || document.querySelector('iframe.b_rwFlyout'));
    if (iframe) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && (iframeDoc.readyState === 'complete' || iframeDoc.readyState === 'interactive')) {
                targetDoc = iframeDoc;
                isIframe = true;
                iframeWin = iframe.contentWindow;
                console.log('成功访问iframe文档');
            }
        }
        catch (e) {
            console.log('访问iframe文档失败:', e.message);
        }
    }
    else {
        console.log('未找到iframe，尝试从主文档获取数据');
    }
    if (!isIframe && window.location.hostname !== 'rewards.bing.com') {
        console.log('当前不在 rewards.bing.com，且未能成功加载 iframe 内容，取消卡片解析，避免误抓取主页元素');
        return false;
    }
    try {
        (() => {
            const tasks = [];
            const cardsArray = discoverCards(targetDoc);
            const finalCards = filterCards(cardsArray);
            console.log('[RewardsHelper] ======== 开始每日任务卡片解析 ========');
            console.log('[RewardsHelper] 全局扫描找到任务卡片数量:', finalCards.length);
            finalCards.forEach((div, idx) => {
                const ariaLabel = div.getAttribute('aria-label') || '';
                const text = div.textContent || '';
                let name = '';
                try {
                    for (const key of Object.keys(div)) {
                        if (key.startsWith('__reactEventHandlers$') || key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')) {
                            const reactObj = div[key];
                            const findTitle = (obj, depth) => {
                                if (depth > 6 || !obj || typeof obj !== 'object')
                                    return '';
                                if (obj.promotion && obj.promotion.title && typeof obj.promotion.title === 'string') {
                                    return obj.promotion.title;
                                }
                                for (const k of Object.keys(obj)) {
                                    if (k === 'children' || k === 'props' || k === 'promotion' || !isNaN(Number(k))) {
                                        try {
                                            const res = findTitle(obj[k], depth + 1);
                                            if (res)
                                                return res;
                                        }
                                        catch (e) { }
                                    }
                                }
                                return '';
                            };
                            const title = findTitle(reactObj, 0);
                            if (title) {
                                name = title;
                                break;
                            }
                        }
                    }
                }
                catch (e) {
                    console.log('获取React属性出错', e);
                }
                if (!name && ariaLabel) {
                    if (ariaLabel.includes(' - ')) {
                        name = ariaLabel.split(' - ')[0];
                    }
                    else {
                        name = ariaLabel;
                    }
                }
                if (!name) {
                    const titleElem = div.querySelector('h3, h4, .title, .rw-card-title, .promo_title, .card-title, div[class*="title"], img[alt]');
                    if (titleElem && titleElem.tagName.toLowerCase() === 'img') {
                        name = titleElem.getAttribute('alt') || '';
                    }
                    else if (titleElem && titleElem.textContent?.trim()) {
                        name = titleElem.textContent.trim();
                    }
                    if (!name) {
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^\+?\s*\d+\s*(分|points?)?$/i.test(l));
                        if (lines.length > 0) {
                            name = lines[0];
                        }
                        else {
                            name = t('parser', 'taskName', idx + 1);
                        }
                    }
                }
                const status = getCardCompletionStatus(div);
                console.log(`[RewardsHelper] 状态推断: ${status}`);
                name = name.replace(/icon\s*$/i, '').trim();
                if (/^\+?\s*\d+\s*(分|points?)?$/i.test(name))
                    name = t('parser', 'taskName', idx + 1);
                if (name.length > 25)
                    name = name.substring(0, 25) + '...';
                console.log(`[RewardsHelper] 最终结果 -> 任务名: "${name}", 状态: "${status}"`);
                if (status === '未完成') {
                    const linkElem = div.tagName.toLowerCase() === 'a' ? div : div.querySelector('a');
                    const href = linkElem ? linkElem.getAttribute('href') : null;
                    if (href && !store.searchState.dailyTasksQueue.includes(href)) {
                        if (!store.searchState.attemptedTasks || !store.searchState.attemptedTasks.includes(href)) {
                            store.searchState.dailyTasksQueue.push(href);
                        }
                        else {
                            console.log(`[RewardsHelper] 任务 "${name}" 已尝试过但未完成，跳过以避免死循环`);
                        }
                    }
                }
                tasks.push({ name, status });
            });
            console.log('\n[RewardsHelper] ======== 任务卡片解析结束 ========');
            console.log('[RewardsHelper] 解析出的最终任务列表:', tasks);
            updateDailyTasksUI(tasks);
            store.dailyTasksData = tasks;
        })();
        let progressFound = false;
        let currentBestProgress = null;
        let potentialProgresses = [];
        const allElements = targetDoc.querySelectorAll('span, div, p');
        for (let el of Array.from(allElements)) {
            const txt = (el.textContent || '').trim();
            if (txt.length > 0 && txt.length < 50) {
                const matches = txt.match(/(\d+)\s*\/\s*(\d+)/);
                if (matches) {
                    const cur = parseInt(matches[1], 10);
                    const max = parseInt(matches[2], 10);
                    if (max >= 12 && max <= 300 && max !== 100 && !txt.toLowerCase().includes('min') && !txt.toLowerCase().includes('level') && !txt.includes('级')) {
                        let parent = el.parentElement;
                        let contextText = txt;
                        let upCount = 0;
                        while (parent && upCount < 3) {
                            contextText += ' ' + (parent.textContent || '');
                            parent = parent.parentElement;
                            upCount++;
                        }
                        contextText = contextText.toLowerCase();
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
            const searchProgresses = potentialProgresses.filter(p => p.isSearch);
            if (searchProgresses.length > 0) {
                best = searchProgresses.reduce((prev, curr) => (prev.max > curr.max) ? prev : curr);
            }
            else {
                let filtered = potentialProgresses.filter(p => p.max !== 80);
                if (filtered.length > 0) {
                    best = filtered.reduce((prev, curr) => (prev.max > curr.max) ? prev : curr);
                }
                else {
                    best = potentialProgresses.reduce((prev, curr) => (prev.max > curr.max) ? prev : curr);
                }
            }
            currentBestProgress = best;
        }
        if (currentBestProgress) {
            const current = currentBestProgress.current;
            store.currentProgress.total = currentBestProgress.max;
            updateProgressUI();
            console.log('搜索进度: ' + current + '/' + store.currentProgress.total);
            if (store.currentProgress.lastChecked > 0 && current <= store.currentProgress.lastChecked && store.isSearching) {
                console.log(`进度未增加: ${current} <= ${store.currentProgress.lastChecked}，已连续 ${store.currentProgress.noProgressCount + 1} 次未增加`);
                store.currentProgress.noProgressCount++;
                if (store.currentProgress.noProgressCount >= config.maxNoProgressCount) {
                    store.searchState.needRest = true;
                    console.log(`达到最大容错次数 ${config.maxNoProgressCount}，需要休息`);
                }
            }
            else if (current > store.currentProgress.lastChecked) {
                console.log(`进度增加: ${current} > ${store.currentProgress.lastChecked}，重置未增加计数`);
                store.currentProgress.noProgressCount = 0;
            }
            store.currentProgress.current = current;
            store.currentProgress.lastChecked = current;
            if (current >= store.currentProgress.total) {
                store.currentProgress.completed = true;
                console.log(`进度数字表明任务已完成: ${current}/${store.currentProgress.total}`);
            }
            if (store.isSearching) {
                store.saveState();
            }
            progressFound = true;
        }
        else {
            console.log('未找到进度元素，检查完成提示');
        }
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
                    store.currentProgress.current = currentPoints;
                    store.currentProgress.total = totalPoints;
                    store.currentProgress.lastChecked = currentPoints;
                    store.currentProgress.completed = rule.completed;
                    const statusStr = rule.completed ? '(已完成)' : '(从提示获取)';
                    updateProgressUI();
                    if (rule.completed) {
                        store.clearState();
                    }
                    else {
                        if (store.isSearching)
                            store.saveState();
                    }
                    return true;
                }
            }
        }
        let iframeTermsFound = false;
        try {
            if (iframeWin && iframeWin.flyoutViewModel) {
                const vm = iframeWin.flyoutViewModel;
                const ss = (vm.flyoutResult && vm.flyoutResult.suggestedSearches) || vm.suggestedSearches;
                if (ss && ss.suggestedItems) {
                    const terms = ss.suggestedItems.map((item) => item.query).filter((q) => q);
                    if (terms.length > 0) {
                        store.iframeSearchTerms = [...terms];
                        iframeTermsFound = true;
                        console.log('从flyoutViewModel变量找到侧边栏搜索词: ' + terms.length + '个');
                    }
                }
            }
        }
        catch (e2) {
            console.log('从flyoutViewModel变量获取失败:', e2.message);
        }
        if (!iframeTermsFound) {
            try {
                const scripts = targetDoc.querySelectorAll('script');
                for (const script of Array.from(scripts)) {
                    const text = script.textContent || '';
                    const idx = text.indexOf('window.flyoutViewModel');
                    if (idx === -1)
                        continue;
                    const braceStart = text.indexOf('{', idx);
                    if (braceStart === -1)
                        continue;
                    let depth = 0;
                    let braceEnd = -1;
                    for (let k = braceStart; k < text.length; k++) {
                        if (text[k] === '{')
                            depth++;
                        else if (text[k] === '}') {
                            depth--;
                            if (depth === 0) {
                                braceEnd = k;
                                break;
                            }
                        }
                    }
                    if (braceEnd === -1)
                        continue;
                    try {
                        const viewModel = JSON.parse(text.substring(braceStart, braceEnd + 1));
                        const ss = (viewModel.flyoutResult && viewModel.flyoutResult.suggestedSearches) || viewModel.suggestedSearches;
                        if (ss && ss.suggestedItems) {
                            const terms = ss.suggestedItems
                                .map((item) => item.query).filter((q) => q);
                            if (terms.length > 0) {
                                store.iframeSearchTerms = [...terms];
                                iframeTermsFound = true;
                                console.log('从script标签解析找到iframe搜索词: ' + terms.length + '个');
                            }
                        }
                    }
                    catch (parseErr) {
                        console.log('JSON解析失败:', parseErr.message);
                    }
                    break;
                }
            }
            catch (e3) {
                console.log('从script标签解析搜索词失败:', e3.message);
            }
        }
        if (!iframeTermsFound) {
            const searchTermsContainer = targetDoc.querySelector('.ss_items_wrapper');
            if (searchTermsContainer) {
                const terms = [];
                const spans = searchTermsContainer.querySelectorAll('span');
                spans.forEach(span => {
                    if (span.textContent)
                        terms.push(span.textContent);
                });
                if (terms.length > 0) {
                    store.iframeSearchTerms = [...terms];
                    iframeTermsFound = true;
                    console.log('从DOM找到侧边栏搜索词: ' + terms.length + '个');
                }
            }
        }
        if (iframeTermsFound) {
            const termsContainer = document.getElementById('iframe-search-terms');
            if (termsContainer) {
                while (termsContainer.firstChild)
                    termsContainer.removeChild(termsContainer.firstChild);
                store.iframeSearchTerms.forEach(term => {
                    const termElem = document.createElement('span');
                    termElem.className = 'rh-term-tag';
                    termElem.textContent = term;
                    termsContainer.appendChild(termElem);
                });
            }
        }
        else {
            console.log('所有方法均未找到侧边栏搜索词');
        }
        return progressFound || iframeTermsFound || (store.dailyTasksData && store.dailyTasksData.length > 0);
    }
    catch (e) {
        console.log('读取面板内容出错: ' + e.message);
        return false;
    }
}
async function executeDailyTasksAsync() {
    try {
        const iframe = document.querySelector('iframe');
        if (!iframe)
            return;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc)
            return;
        const cardsArray = discoverCards(iframeDoc);
        const finalCards = filterCards(cardsArray);
        let hasNewTasks = false;
        for (let i = 0; i < finalCards.length; i++) {
            const div = finalCards[i];
            const status = getCardCompletionStatus(div);
            if (status === '未完成') {
                const linkElem = div.tagName.toLowerCase() === 'a' ? div : div.querySelector('a');
                const href = linkElem ? linkElem.getAttribute('href') : null;
                if (href && !store.searchState.dailyTasksQueue.includes(href)) {
                    store.searchState.dailyTasksQueue.push(href);
                    hasNewTasks = true;
                }
            }
        }
        if (hasNewTasks) {
            console.log(`[RewardsHelper] 已将 ${store.searchState.dailyTasksQueue.length} 个任务加入执行队列`);
        }
    }
    catch (e) {
        console.log('执行每日任务出错', e);
    }
}

;// ./src/search.ts






async function simulateScrollingAsync() {
    updateStatus(t('status', 'browsing'));
    store.searchState.currentAction = 'scrolling';
    for (let i = 0; i < 3; i++) {
        const results = document.querySelectorAll('.b_algo');
        if (results.length > 0) {
            const randomResult = results[Math.floor(Math.random() * results.length)];
            await simulateMouseInteraction(randomResult);
        }
        window.scrollBy({
            top: window.innerHeight * (0.3 + Math.random() * 0.4),
            behavior: 'smooth'
        });
        const scrollWait = Math.floor(config.scrollTime / 3) * 1000;
        await countdownAsync(scrollWait / 1000, 'scrolling');
        if (!store.isSearching)
            break;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function countdownAsync(seconds, action) {
    return new Promise(resolve => {
        if (store.countdownTimer) {
            clearInterval(store.countdownTimer);
            store.countdownTimer = null;
        }
        store.searchState.currentAction = action;
        store.searchState.countdown = seconds;
        updateCountdown(seconds, action);
        const timerId = setInterval(() => {
            if (!store.isSearching) {
                clearInterval(timerId);
                store.countdownTimer = null;
                resolve();
                return;
            }
            store.searchState.countdown--;
            updateCountdown(store.searchState.countdown, action);
            if (store.searchState.countdown <= 0) {
                clearInterval(timerId);
                store.countdownTimer = null;
                resolve();
            }
        }, 1000);
        store.countdownTimer = timerId;
    });
}
async function ensureFallbackSearchTerms() {
    if (!store.dynamicSearchTerms || store.dynamicSearchTerms.length < 10) {
        console.log('[RewardsHelper] 动态词库不足，尝试获取新词库...');
        const newTerms = await fetchOrganicSearchTerms();
        if (newTerms.length > 0) {
            store.dynamicSearchTerms = [...newTerms, ...store.dynamicSearchTerms];
            store.dynamicSearchTerms = [...new Set(store.dynamicSearchTerms)]; // deduplicate
        }
    }
}
function getSearchTerm() {
    let term = '';
    if (store.iframeSearchTerms && store.iframeSearchTerms.length > 0) {
        let attempts = 0;
        while (attempts < store.iframeSearchTerms.length) {
            const index = Math.floor(Math.random() * store.iframeSearchTerms.length);
            const candidate = store.iframeSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                console.log(`使用侧边栏词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }
    if (!term && store.mainPageSearchTerms && store.mainPageSearchTerms.length > 0) {
        let attempts = 0;
        while (attempts < store.mainPageSearchTerms.length) {
            const index = Math.floor(Math.random() * store.mainPageSearchTerms.length);
            const candidate = store.mainPageSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                console.log(`使用主页面词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }
    if (!term && store.dynamicSearchTerms && store.dynamicSearchTerms.length > 0) {
        let attempts = 0;
        while (attempts < store.dynamicSearchTerms.length) {
            const index = Math.floor(Math.random() * store.dynamicSearchTerms.length);
            const candidate = store.dynamicSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                store.dynamicSearchTerms.splice(index, 1);
                console.log(`使用动态词库词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }
    if (!term) {
        let attempts = 0;
        while (attempts < 50) {
            const index = Math.floor(Math.random() * store.fallbackSearchTerms.length);
            const candidate = store.fallbackSearchTerms[index];
            if (!store.usedSearchTerms.includes(candidate)) {
                term = candidate;
                console.log(`使用后备词汇: ${term}`);
                break;
            }
            attempts++;
        }
    }
    if (!term) {
        term = `Search ${Math.floor(Math.random() * 10000)} ${Date.now().toString().slice(-4)}`;
        console.log(`使用随机生成词汇: ${term}`);
    }
    store.usedSearchTerms.push(term);
    return term;
}
function stopAutomatedSearch() {
    if (store.countdownTimer) {
        clearInterval(store.countdownTimer);
        store.countdownTimer = null;
    }
    store.isSearching = false;
    store.searchState.currentAction = 'idle';
    store.searchState.needRest = false;
    store.searchState.dailyTasksQueue = [];
    store.searchState.attemptedTasks = [];
    store.saveState();
    store.currentProgress.noProgressCount = 0;
    store.usedSearchTerms = [];
    updateCountdown(0, '');
    store.clearState();
    setSearchButtonState('idle');
    updateStatus(t('status', 'searchStopped'));
}
async function performSearch() {
    if (!store.isSearching)
        return;
    await ensureFallbackSearchTerms();
    const searchTerm = getSearchTerm();
    updateStatus(t('status', 'searching', searchTerm));
    store.saveState();
    const url = `https://www.bing.com/search?q=${encodeURIComponent(searchTerm)}`;
    const typingSuccess = await simulateTypingAndSearch(searchTerm);
    if (typingSuccess) {
        // Wait up to 5 seconds for page navigation to happen naturally
        await sleep(5000);
        console.log('[RewardsHelper] 模拟提交后页面未发生跳转，使用 fallback 跳转');
    }
    window.location.href = url;
}
async function searchLoop() {
    while (store.isSearching && !store.searchState.needRest) {
        updateStatus(t('status', 'waitingProgress'));
        store.searchState.currentAction = 'checking';
        if (await openRewardsSidebarAsync()) {
            await waitForIframeContent(10000);
            getDataFromPanel();
            getSearchTermsFromMainDoc();
            await closeRewardsSidebarAsync();
            if (store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0) {
                updateStatus(t('status', 'executingPanel'));
                const nextTaskUrl = store.searchState.dailyTasksQueue.shift();
                store.saveState();
                if (nextTaskUrl) {
                    window.location.href = nextTaskUrl;
                    return;
                }
            }
            if (store.currentProgress.completed) {
                showCompletionNotification();
                updateStatus(t('status', 'allCompleted'));
                stopAutomatedSearch();
                return;
            }
            if (store.searchState.needRest) {
                store.searchState.needRest = false;
                store.currentProgress.noProgressCount = 0;
                updateStatus(t('status', 'resting', config.maxNoProgressCount, config.restTime / 60));
                await countdownAsync(config.restTime, 'resting');
                if (!store.isSearching)
                    return;
                updateStatus(t('status', 'restFinished'));
                await sleep(1000);
                continue;
            }
        }
        else {
            updateStatus(t('status', 'failedSidebarDirect'));
        }
        if (!store.isSearching)
            return;
        updateStatus(t('status', 'waitingNext'));
        const waitMs = getRandomInterval();
        await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
        if (store.isSearching) {
            performSearch();
            return; // page will navigate, loop ends
        }
    }
}
async function startAutomatedSearch() {
    if (store.currentProgress.completed) {
        updateStatus(t('status', 'alreadyCompleted'));
        return;
    }
    console.log('[RewardsHelper] 准备工作就绪，启动后台任务');
    store.isSearching = true;
    store.searchState.needRest = false;
    store.currentProgress.noProgressCount = 0;
    store.usedSearchTerms = [];
    setSearchButtonState('searching');
    updateStatus(t('status', 'autoStarted'));
    store.saveState();
    await executeDailyTasksAsync();
    if (store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0) {
        updateStatus(t('status', 'executingPanel'));
        const nextTaskUrl = store.searchState.dailyTasksQueue.shift();
        store.saveState();
        if (nextTaskUrl)
            window.location.href = nextTaskUrl;
        return;
    }
    searchLoop();
}

;// ./src/ui.ts



function injectStyles() {
    if (document.getElementById('rh-styles'))
        return;
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
function createUI() {
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
    }
    else {
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
            if (!badgeContainer.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }
    const startBtn = document.getElementById('rh-start-btn');
    if (startBtn) {
        startBtn.onclick = () => {
            if (!store.isSearching)
                startAutomatedSearch();
            else
                stopAutomatedSearch();
            if (dropdown)
                dropdown.classList.remove('show');
        };
    }
}
function showToast(message, duration = 3000) {
    const toast = document.getElementById('rh-toast');
    if (!toast)
        return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}
function updateStatus(message) {
    const statusText = document.getElementById('rh-status-text');
    if (statusText)
        statusText.textContent = `${t('ui', 'statusPrefix')}${message}`;
    console.log(message);
}
function updateProgressUI() {
    const badgeText = document.getElementById('rh-badge-text');
    const progressText = document.getElementById('rh-progress-text');
    const progressFill = document.getElementById('rh-progress-fill');
    const curr = store.currentProgress.current || 0;
    const total = store.currentProgress.total || 0;
    const isCompleted = store.currentProgress.completed;
    const text = isCompleted ? t('ui', 'completed') : `${curr}/${total}`;
    if (badgeText)
        badgeText.textContent = text;
    if (progressText)
        progressText.textContent = text;
    if (progressFill && total > 0) {
        const percent = Math.min(100, Math.max(0, (curr / total) * 100));
        progressFill.style.width = `${percent}%`;
    }
}
function updateCountdown(seconds, action) {
    const statusText = document.getElementById('rh-status-text');
    if (!statusText)
        return;
    if (seconds > 0) {
        let actionText = '';
        switch (action) {
            case 'scrolling':
                actionText = t('ui', 'statusScrolling');
                break;
            case 'waiting':
                actionText = t('ui', 'statusWaiting');
                break;
            case 'resting':
                actionText = t('ui', 'statusResting');
                break;
            case 'checking':
                actionText = t('ui', 'statusChecking');
                break;
            default: actionText = t('ui', 'statusCountdown');
        }
        statusText.textContent = `${t('ui', 'statusPrefix')}⏳ ${actionText}... (${seconds}s)`;
    }
    else {
        // Reset to default status logic is handled by caller via updateStatus
    }
}
function updateDailyTasksUI(tasks) {
    const tasksList = document.getElementById('rh-tasks-list');
    const tasksCount = document.getElementById('rh-tasks-count');
    if (!tasksList)
        return;
    if (!tasks || tasks.length === 0) {
        tasksList.innerHTML = `<div style="color: var(--rh-success); font-weight: 500;">${t('parser', 'noTasks')}</div>`;
        if (tasksCount)
            tasksCount.textContent = '';
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
function showCompletionNotification() {
    showToast(t('status', 'allCompletedToast', store.currentProgress.total), 6000);
}
function applyTheme() {
    // Theme is mostly handled by CSS matching .b_dark on body/html
    const badge = document.getElementById('rh-badge');
    const btn = document.getElementById('rh-start-btn');
    if (btn && !store.isSearching) {
        btn.style.backgroundColor = 'var(--rh-accent)';
    }
}
function setSearchButtonState(state) {
    const btn = document.getElementById('rh-start-btn');
    const badge = document.getElementById('rh-badge');
    if (btn) {
        if (state === 'searching') {
            btn.textContent = t('ui', 'stopFarming');
            btn.className = 'rh-btn danger';
        }
        else {
            btn.textContent = t('ui', 'startFarming');
            btn.className = 'rh-btn';
        }
    }
    if (badge) {
        if (state === 'searching') {
            badge.classList.add('searching');
        }
        else {
            badge.classList.remove('searching');
        }
    }
}
function toggleCollapse() { }
function applyCollapseState() { }
function makeDraggable() { }

;// ./src/index.ts








function restoreState() {
    const savedState = store.loadState();
    if (savedState && savedState.isSearching) {
        store.isSearching = true;
        if (savedState.currentProgress)
            store.currentProgress = savedState.currentProgress;
        if (savedState.usedSearchTerms)
            store.usedSearchTerms = savedState.usedSearchTerms;
        if (savedState.mainPageSearchTerms)
            store.mainPageSearchTerms = savedState.mainPageSearchTerms;
        if (savedState.iframeSearchTerms)
            store.iframeSearchTerms = savedState.iframeSearchTerms;
        updateProgressUI();
        updateStatus(t('status', 'detectedPrev'));
        setTimeout(async () => {
            if (!store.currentProgress.completed) {
                console.log('恢复搜索状态，继续之前的搜索任务');
                setSearchButtonState('searching');
                if (!store.isSearching)
                    return;
                await simulateScrollingAsync();
                if (store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0) {
                    updateStatus(t('status', 'executingPanel'));
                    await sleep(2000);
                    const nextTaskUrl = store.searchState.dailyTasksQueue.shift();
                    if (nextTaskUrl) {
                        if (!store.searchState.attemptedTasks)
                            store.searchState.attemptedTasks = [];
                        store.searchState.attemptedTasks.push(nextTaskUrl);
                        store.saveState();
                        window.location.href = nextTaskUrl;
                        return;
                    }
                }
                if (!store.isSearching)
                    return;
                updateStatus(t('status', 'checkingProgress'));
                store.searchState.currentAction = 'checking';
                if (await openRewardsSidebarAsync()) {
                    await waitForIframeContent(10000);
                    getDataFromPanel();
                    getSearchTermsFromMainDoc();
                    await closeRewardsSidebarAsync();
                    if (store.searchState.dailyTasksQueue && store.searchState.dailyTasksQueue.length > 0) {
                        updateStatus(t('status', 'executingPanel'));
                        const nextTaskUrl = store.searchState.dailyTasksQueue.shift();
                        if (nextTaskUrl) {
                            if (!store.searchState.attemptedTasks)
                                store.searchState.attemptedTasks = [];
                            store.searchState.attemptedTasks.push(nextTaskUrl);
                            store.saveState();
                            window.location.href = nextTaskUrl;
                            return;
                        }
                    }
                    if (store.currentProgress.completed) {
                        showCompletionNotification();
                        updateStatus(t('status', 'allCompleted'));
                        stopAutomatedSearch();
                        return;
                    }
                    if (store.searchState.needRest) {
                        store.searchState.needRest = false;
                        store.currentProgress.noProgressCount = 0;
                        updateStatus(t('status', 'resting', config.maxNoProgressCount, config.restTime / 60));
                        await countdownAsync(config.restTime, 'resting');
                        updateStatus(t('status', 'restFinished'));
                        await sleep(1000);
                    }
                }
                else {
                    updateStatus(t('status', 'failedSidebarCheck'));
                }
                if (!store.isSearching)
                    return;
                updateStatus(t('status', 'waitingNext'));
                const waitMs = getRandomInterval();
                await countdownAsync(Math.floor(waitMs / 1000), 'waiting');
                if (store.isSearching) {
                    searchLoop();
                }
            }
            else {
                updateStatus(t('status', 'prevCompleted'));
                store.clearState();
            }
        }, 3000);
        return true;
    }
    return false;
}
window.addEventListener('beforeunload', () => {
    if (store.isSearching) {
        store.saveState();
    }
});
// skip running inside iframes (e.g. rewards sidebar)
if (window === window.top) {
    window.addEventListener('load', function () {
        console.log('Rewards Points Farmer 已加载');
        store.loadConfig();
        createUI();
        applyCollapseState();
        window.startRewardsTask = startAutomatedSearch;
        window.stopRewardsTask = stopAutomatedSearch;
        window.__e2e_performSearch = performSearch;
        window.__e2e_simulateTypingAndSearch = simulateTypingAndSearch;
        const observer = new MutationObserver(() => applyTheme());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-darkmode'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
        setTimeout(() => {
            const restored = restoreState();
            if (!restored) {
                setTimeout(() => {
                    const getRewardsDataAsync = async () => {
                        if (await openRewardsSidebarAsync()) {
                            await waitForIframeContent(10000);
                            getDataFromPanel();
                            getSearchTermsFromMainDoc();
                            await closeRewardsSidebarAsync();
                        }
                        else {
                            getSearchTermsFromMainDoc();
                        }
                    };
                    getRewardsDataAsync();
                }, 1000);
            }
        }, 1000);
    });
}

/******/ })()
;