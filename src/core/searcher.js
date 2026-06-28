import { store } from "../state.js";
import { getRandomInterval, countdownAsync, sleep, isDarkMode } from "../utils.js";
import { updateStatus, showCompletionNotification } from "../ui/panel.js";
import { config } from "../config.js";
import { executeDailyTasksAsync, simulateScrollingAsync } from "./tasks.js";
import { getRewardsDataAsync, getDataFromPanel, getSearchTermsFromMainDoc, openRewardsSidebarAsync, closeRewardsSidebarAsync } from "./scraper.js";



export { getSearchTerm, searchLoop, stopAutomatedSearch, startAutomatedSearch, restoreState, applyTheme };
