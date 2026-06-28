import { store } from "../state.js";
import { waitForElement, sleep } from "../utils.js";
import { updateStatus, updateTaskProgress } from "../ui/panel.js";
import { config, fallbackSearchTerms } from "../config.js";

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

export { getRewardsDataAsync, getDataFromPanel, getIframeSearchTerms, getSearchTermsFromMainDoc, ensureFallbackSearchTerms, openRewardsSidebarAsync, closeRewardsSidebarAsync };
