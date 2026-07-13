type Locale = 'zh' | 'en';

let currentLocale: Locale | null = null;

export function getLocale(): Locale {
    if (currentLocale) return currentLocale;
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh')) {
        currentLocale = 'zh';
    } else {
        currentLocale = 'en';
    }
    return currentLocale;
}

export const messages = {
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
            completed: "✅ 完成",
            settings: "设置",
            back: "返回",
            searchInterval: "搜索间隔（秒）",
            minInterval: "最短",
            maxInterval: "最长",
            scrollTime: "单轮滚动时长（秒）",
            restTime: "暂停时长（分钟）",
            maxNoProgressCount: "无进度重试次数",
            saveSettings: "保存设置",
            settingsSaved: "设置已保存",
            dedicatedWorker: "专用任务标签页"
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
            allCompletedToast: (total: number) => `🎉 已完成所有 ${total} 次搜索任务！`,
            resting: (count: number, mins: number) => `连续 ${count} 次无进度，休息 ${mins} 分后继续`,
            restFinished: "休息结束，继续搜索",
            autoStarted: "自动搜索已开始...",
            alreadyCompleted: "任务已经完成，无需搜索",
            failedSidebarDirect: "无法打开侧边栏，尝试直接搜索",
            waitingProgress: "等待获取进度信息...",
            searchStopped: "搜索已停止",
            searching: (term: string) => `正在搜索: ${term}`,
            openingWorker: "正在打开专用任务标签页...",
            popupBlocked: "无法打开专用任务标签页，请允许此站点打开弹窗",
            stopRequested: "已通知专用任务标签页停止",
            runningInWorker: "任务正在专用标签页中执行"
        },
        parser: {
            completed: "已完成",
            incomplete: "未完成",
            taskName: (idx: number) => `任务${idx}`,
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
            completed: "✅ Done",
            settings: "Settings",
            back: "Back",
            searchInterval: "Search interval (seconds)",
            minInterval: "Minimum",
            maxInterval: "Maximum",
            scrollTime: "Scroll duration (seconds)",
            restTime: "Rest duration (minutes)",
            maxNoProgressCount: "No-progress retries",
            saveSettings: "Save settings",
            settingsSaved: "Settings saved",
            dedicatedWorker: "Dedicated task tab"
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
            allCompletedToast: (total: number) => `🎉 Completed all ${total} search tasks!`,
            resting: (count: number, mins: number) => `No progress for ${count} times, resting for ${mins} min`,
            restFinished: "Rest finished, resuming search",
            autoStarted: "Automated search started...",
            alreadyCompleted: "Tasks already completed, no need to search",
            failedSidebarDirect: "Failed to open sidebar, trying direct search",
            waitingProgress: "Waiting for progress info...",
            searchStopped: "Search stopped",
            searching: (term: string) => `Searching: ${term}`,
            openingWorker: "Opening the dedicated task tab...",
            popupBlocked: "Unable to open the dedicated task tab. Allow pop-ups for this site.",
            stopRequested: "The dedicated task tab was asked to stop",
            runningInWorker: "Task is running in the dedicated tab"
        },
        parser: {
            completed: "Completed",
            incomplete: "Incomplete",
            taskName: (idx: number) => `Task ${idx}`,
            noTasks: "✅ No daily card tasks found",
            allTasksDone: "✅ Daily card tasks all completed!"
        }
    }
};

export function t(category: 'ui' | 'status' | 'parser', key: string, ...args: any[]): string {
    const locale = getLocale();
    const group = messages[locale][category] as any;
    if (!group || !group[key]) {
        return `${category}.${key}`;
    }
    const value = group[key];
    if (typeof value === 'function') {
        return value(...args);
    }
    return value;
}
