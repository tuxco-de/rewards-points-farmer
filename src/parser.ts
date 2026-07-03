import { config } from './config';
import { store } from './state';
import { updateDailyTasksUI, updateProgressUI } from './ui';
import { t } from './i18n';

export async function fetchOrganicSearchTerms() {
    try {
        const url = 'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=15&format=json&origin=*';
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.query && data.query.random) {
            console.log('[RewardsHelper] 成功获取动态词库');
            return data.query.random.map((page: any) => page.title);
        }
    } catch (e) {
        console.error('[RewardsHelper] 获取动态词库失败', e);
    }
    return [];
}

export function getSearchTermsFromMainDoc() {
    const terms: string[] = [];
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
    } else {
        console.log('未找到主页面搜索词');
        return false;
    }
}

// ========== Shared card parsing helpers ==========

function discoverCards(doc: Document): Set<Element> {
    const cardsArray = new Set<Element>();
    
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
                    if (card) cardsArray.add(card);
                }
            }
        }
    } catch(e) {
        console.warn('扫描文本节点时出错:', e);
    }

    return cardsArray;
}

function filterCards(cardsArray: Set<Element>): Element[] {
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

function getCardPoints(card: Element): number {
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
        if (match) points = parseInt(match[1], 10);
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

function getCardCompletionStatus(card: Element): string {
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
    } else if (pAriaLower.includes('积分') || pAriaLower.includes('points')) {
        return '未完成';
    } else if (ariaLower.includes('not completed') || ariaLower.includes('未完成')) {
        return '未完成';
    } else if (ariaLower.includes('is completed') || ariaLower.includes('completed') || ariaLower.includes('已完成')) {
        return '已完成';
    } else {
        const hasCheck = /check|completed|已完成/i.test(html) || /已完成/.test(text);
        const hasAdd = /add|plus/i.test(html) || /未完成/.test(text) || /^\+\s*\d+/.test(text) || html.includes('+');
        if (hasCheck && !hasAdd) {
            return '已完成';
        }
        return '未完成';
    }
}

export function getDataFromPanel() {
    let targetDoc = document;
    let isIframe = false;
    let iframeWin: any = window;

    const iframe = (document.querySelector('iframe[src*="rewards/panelflyout"]') || document.querySelector('iframe#b_rwFlyout') || document.querySelector('iframe.b_rwFlyout')) as HTMLIFrameElement;
    if (iframe) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && (iframeDoc.readyState === 'complete' || iframeDoc.readyState === 'interactive')) {
                targetDoc = iframeDoc;
                isIframe = true;
                iframeWin = iframe.contentWindow;
                console.log('成功访问iframe文档');
            }
        } catch (e: any) {
            console.log('访问iframe文档失败:', e.message);
        }
    } else {
        console.log('未找到iframe，尝试从主文档获取数据');
    }

    if (!isIframe && window.location.hostname !== 'rewards.bing.com') {
        console.log('当前不在 rewards.bing.com，且未能成功加载 iframe 内容，取消卡片解析，避免误抓取主页元素');
        return false;
    }

    try {
        (() => {
            const tasks: any[] = [];
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
                            const reactObj = (div as any)[key];
                            
                            const findTitle = (obj: any, depth: number): string => {
                                if (depth > 6 || !obj || typeof obj !== 'object') return '';
                                if (obj.promotion && obj.promotion.title && typeof obj.promotion.title === 'string') {
                                    return obj.promotion.title;
                                }
                                for (const k of Object.keys(obj)) {
                                    if (k === 'children' || k === 'props' || k === 'promotion' || !isNaN(Number(k))) {
                                        try {
                                            const res = findTitle(obj[k], depth + 1);
                                            if (res) return res;
                                        } catch (e) {}
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
                } catch (e) {
                    console.log('获取React属性出错', e);
                }

                if (!name && ariaLabel) {
                    if (ariaLabel.includes(' - ')) {
                        name = ariaLabel.split(' - ')[0];
                    } else {
                        name = ariaLabel;
                    }
                }
                
                if (!name) {
                    const titleElem = div.querySelector('h3, h4, .title, .rw-card-title, .promo_title, .card-title, div[class*="title"], img[alt]');
                    if (titleElem && titleElem.tagName.toLowerCase() === 'img') {
                        name = titleElem.getAttribute('alt') || '';
                    } else if (titleElem && titleElem.textContent?.trim()) {
                        name = titleElem.textContent.trim();
                    }
                    
                    if (!name) {
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^\+?\s*\d+\s*(分|points?)?$/i.test(l));
                        if (lines.length > 0) {
                            name = lines[0];
                        } else {
                            name = t('parser', 'taskName', idx + 1);
                        }
                    }
                }

                const status = getCardCompletionStatus(div);
                console.log(`[RewardsHelper] 状态推断: ${status}`);

                name = name.replace(/icon\s*$/i, '').trim();
                if (/^\+?\s*\d+\s*(分|points?)?$/i.test(name)) name = t('parser', 'taskName', idx + 1);
                if (name.length > 25) name = name.substring(0, 25) + '...';
                
                console.log(`[RewardsHelper] 最终结果 -> 任务名: "${name}", 状态: "${status}"`);
                
                if (status === '未完成') {
                    const linkElem = div.tagName.toLowerCase() === 'a' ? div : div.querySelector('a');
                    const href = linkElem ? linkElem.getAttribute('href') : null;
                    if (href && !store.searchState.dailyTasksQueue.includes(href)) {
                        if (!store.searchState.attemptedTasks || !store.searchState.attemptedTasks.includes(href)) {
                            store.searchState.dailyTasksQueue.push(href);
                        } else {
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
        let currentBestProgress: any = null;

        let potentialProgresses: any[] = [];
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
            } else {
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
            } else if (current > store.currentProgress.lastChecked) {
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
        } else {
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
                    } else {
                        if (store.isSearching) store.saveState();
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
                    const urls = ss.suggestedItems.map((item: any) => item.url).filter((u: any) => u);
                    if (urls.length > 0) {
                        urls.forEach((u: string) => {
                            if (!store.searchState.dailyTasksQueue.includes(u)) {
                                store.searchState.dailyTasksQueue.push(u);
                            }
                        });
                        console.log('从flyoutViewModel变量找到侧边栏卡片任务链接: ' + urls.length + '个，已加入跳转队列');
                    }
                }
            }
        } catch (e2: any) {
            console.log('从flyoutViewModel变量获取失败:', e2.message);
        }

        if (!iframeTermsFound) {
            try {
                const scripts = targetDoc.querySelectorAll('script');
                for (const script of Array.from(scripts)) {
                    const text = script.textContent || '';
                    const idx = text.indexOf('window.flyoutViewModel');
                    if (idx === -1) continue;
                    const braceStart = text.indexOf('{', idx);
                    if (braceStart === -1) continue;
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
                            const urls = ss.suggestedItems
                                .map((item: any) => item.url).filter((u: any) => u);
                            if (urls.length > 0) {
                                urls.forEach((u: string) => {
                                    if (!store.searchState.dailyTasksQueue.includes(u)) {
                                        store.searchState.dailyTasksQueue.push(u);
                                    }
                                });
                                console.log('从script标签解析找到iframe卡片任务链接: ' + urls.length + '个，已加入跳转队列');
                            }
                        }
                    } catch (parseErr: any) {
                        console.log('JSON解析失败:', parseErr.message);
                    }
                    break;
                }
            } catch (e3: any) {
                console.log('从script标签解析搜索词失败:', e3.message);
            }
        }

        if (!iframeTermsFound) {
            const searchTermsContainer = targetDoc.querySelector('.ss_items_wrapper');
            if (searchTermsContainer) {
                let found = 0;
                const links = searchTermsContainer.querySelectorAll('a');
                links.forEach(a => {
                    const u = a.getAttribute('href');
                    if (u && !store.searchState.dailyTasksQueue.includes(u)) {
                        store.searchState.dailyTasksQueue.push(u);
                        found++;
                    }
                });
                
                if (found > 0) {
                    console.log('从DOM结构中提取侧边栏卡片任务链接: ' + found + '个，已加入跳转队列');
                }
            }
        }

        if (iframeTermsFound) {
            const termsContainer = document.getElementById('iframe-search-terms');
            if (termsContainer) {
                while (termsContainer.firstChild) termsContainer.removeChild(termsContainer.firstChild);
                store.iframeSearchTerms.forEach(term => {
                    const termElem = document.createElement('span');
                    termElem.className = 'rh-term-tag';
                    termElem.textContent = term;
                    termsContainer.appendChild(termElem);
                });
            }
        } else {
            console.log('所有方法均未找到侧边栏搜索词');
        }

        return progressFound || iframeTermsFound || (store.dailyTasksData && store.dailyTasksData.length > 0);
    } catch (e: any) {
        console.log('读取面板内容出错: ' + e.message);
        return false;
    }
}

export async function executeDailyTasksAsync() {
    try {
        const iframe = document.querySelector('iframe') as HTMLIFrameElement;
        if (!iframe) return;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;
        
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
    } catch (e) {
        console.log('执行每日任务出错', e);
    }
}

export async function clickTaskCardAsync(url: string): Promise<boolean> {
    try {
        const iframe = document.querySelector('iframe[src*="rewards/panelflyout"], iframe#b_rwFlyout, iframe.b_rwFlyout') as HTMLIFrameElement;
        if (!iframe) return false;
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return false;
        
        let linkElem = iframeDoc.querySelector(`a[href="${url}"]`);
        if (!linkElem) {
            const urlPath = url.split('?')[0];
            linkElem = iframeDoc.querySelector(`a[href^="${urlPath}"]`);
        }
        
        if (linkElem) {
            const targetElem = linkElem as HTMLElement;
            console.log(`[RewardsHelper] 找到任务卡片并模拟点击: ${url}`);
            
            const rect = targetElem.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const targetX = rect.left + rect.width / 2;
                const targetY = rect.top + rect.height / 2;
                targetElem.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: targetX, clientY: targetY }));
                await new Promise(r => setTimeout(r, 100));
                targetElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: targetX, clientY: targetY }));
                await new Promise(r => setTimeout(r, 50));
            }
            
            targetElem.click();
            return true;
        }
    } catch (e) {
        console.warn('[RewardsHelper] 模拟点击卡片时出错:', e);
    }
    return false;
}
