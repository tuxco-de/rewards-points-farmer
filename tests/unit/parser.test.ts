import { getCardCompletionStatus, isRewardsTaskCard, parseEarnedProgressText } from '../../src/parser';

describe('Rewards parser', () => {
    test('prefers an explicit completed card label over a generic point label', () => {
        const card = document.createElement('a');
        card.setAttribute('aria-label', 'Daily poll is completed');
        card.innerHTML = '<span class="point" aria-label="10 points">+10</span>';

        expect(getCardCompletionStatus(card)).toBe('已完成');
    });

    test('does not treat a partial earned summary as completed', () => {
        expect(parseEarnedProgressText('You earned 80 points already')).toBeNull();
    });

    test('parses the explicit multiline English total', () => {
        expect(parseEarnedProgressText(
            'You earned 80 points already. Keep searching to earn up to 200 points today.'
        )).toMatchObject({
            current: 80,
            total: 200,
            completed: false
        });
    });

    test('parses a completed Chinese summary that labels the total as reward points', () => {
        expect(parseEarnedProgressText(
            '你已获得 200 积分！每天继续搜索并获得最多 200 奖励积分'
        )).toMatchObject({
            current: 200,
            total: 200,
            completed: true,
            rule: 'earned_zh'
        });
    });

    test.each([
        ['auto redeem', '准备好获得下一个奖品了吗? 设置自动兑换', 'https://rewards.bing.com/redeem/'],
        ['earned points summary', '你已获得 200 积分！每天继续搜索并获得最多 200 奖励积分', 'https://www.bing.com/?form=RWSE01'],
        ['referral promotion', '将推荐转化为奖励 当朋友搜索时可赚取 15,000 积分', 'https://rewards.bing.com/referandearn'],
        ['cashback promotion', 'Microsoft Cashback 购物时赚取现金返还', 'https://www.bing.com/rebates'],
    ])('rejects a generic %s promo card', (_name, text, href) => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.innerHTML = `<a href="${href}">${text}</a>`;

        expect(isRewardsTaskCard(card)).toBe(false);
    });

    test('accepts a search activity inside the Rewards checklist', () => {
        const checklist = document.createElement('div');
        checklist.id = 'exb-activityChecklist';
        checklist.innerHTML = `
            <div class="promo_cont" id="exclusive_promo_cont">
                <a href="https://www.bing.com/?form=ML2PCR">
                    <span class="point">10</span>
                    <span>彻底放松</span>
                </a>
            </div>`;

        expect(isRewardsTaskCard(checklist.firstElementChild!)).toBe(true);
    });

    test('accepts a compact daily task outside the search checklist', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont slim';
        card.innerHTML = `
            <a href="https://www.bing.com/rewards/checkuser">
                <span class="point">30</span>
                <span>极速问答</span>
            </a>`;

        expect(isRewardsTaskCard(card)).toBe(true);
    });

    test('rejects a card without an actionable link', () => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.textContent = '你已获得 200 积分！';

        expect(isRewardsTaskCard(card)).toBe(false);
    });
});
