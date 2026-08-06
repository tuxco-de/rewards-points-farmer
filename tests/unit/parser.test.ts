import { clickTaskCardAsync, getCardCompletionStatus, isRewardsTaskCard, parseEarnedProgressText } from '../../src/parser';

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

    test('parses reverse English progress statement', () => {
        expect(parseEarnedProgressText(
            'Earn up to 90 points by searching. You earned 45 points so far.'
        )).toMatchObject({
            current: 45,
            total: 90,
            completed: false,
            rule: 'earned_en_reverse'
        });
    });

    test('parses generic PC search fraction format', () => {
        expect(parseEarnedProgressText(
            'PC Search 60/90 pts'
        )).toMatchObject({
            current: 60,
            total: 90,
            completed: false,
            rule: 'generic_fraction'
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

    test('accepts a point-bearing Bing activity rendered as an ordinary promo card', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.innerHTML = `
            <a href="https://www.bing.com/search?q=%E5%BB%89%E4%BB%B7%E6%9C%BA%E7%A5%A8">
                <span class="promo-title">使用 Bing 预订航班</span>
                <span class="point">5</span>
            </a>`;

        expect(isRewardsTaskCard(card)).toBe(true);
    });

    test('rejects the point-free Rewards browser extension promotion', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.setAttribute('aria-label', 'Rewards in your browser - Offer not Completed');
        card.innerHTML = `
            <a href="https://www.bing.com/set/browserextension/rewards?channel=rwdamc">
                <span class="promo-title">Rewards in your browser</span>
                <span>Add our new browser extension &amp; earn 30 points.</span>
            </a>`;

        expect(isRewardsTaskCard(card)).toBe(false);
    });

    test('does not mistake a checkuser URL for a completion marker', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.innerHTML = `
            <a href="https://www.bing.com/rewards/checkuser?task=daily-poll">
                <span class="promo-title">每日投票</span>
                <span class="point">10</span>
            </a>`;

        expect(getCardCompletionStatus(card)).toBe('未完成');
    });

    test('does not treat a checklist card with complete and inprogress classes as completed', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.innerHTML = `
            <a href="https://www.bing.com/?form=ML2PCR">
                <span class="promo-title">即将起飞</span>
                <span class="fc_auto pc b_subtitle complete slim inprogress">
                    <span class="shortPoint point" aria-label="10 points">10</span>
                </span>
            </a>`;

        expect(getCardCompletionStatus(card)).toBe('未完成');
    });

    test('reads the completed point label nested inside a point container', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.innerHTML = `
            <a href="https://www.bing.com/?form=ML2PCR">
                <span class="promo-title">即将起飞</span>
                <span class="fc_auto pc b_subtitle complete slim inprogress">
                    <span class="point_cont slim">
                        <span class="shortPoint point" aria-label="10 添加到帐户的积分">✓ 10</span>
                    </span>
                </span>
            </a>`;

        expect(getCardCompletionStatus(card)).toBe('已完成');
    });

    test.each([
        [0, 10, '未完成'],
        [30, 30, '已完成'],
    ])('uses embedded Rewards progress %i/%i to determine completion', (current, total, expected) => {
        const card = document.createElement('div');
        card.className = 'promo_cont slim';
        const nestedTarget = encodeURIComponent(`/search?q=quiz&filters=BTROEC%3A%22${current}%22+BTROMC%3A%22${total}%22`);
        card.innerHTML = `
            <a href="https://www.bing.com/rewards/checkuser?ru=${nestedTarget}">
                <span class="promo-title">极速问答</span>
                <span class="point">${total}</span>
            </a>`;

        expect(getCardCompletionStatus(card)).toBe(expected);
    });

    test('still rejects a point-bearing referral promotion', () => {
        const card = document.createElement('div');
        card.className = 'promo_cont';
        card.innerHTML = `
            <a href="https://rewards.bing.com/refer">
                <span class="promo-title">将推荐转化为奖励</span>
                <span class="point">10</span>
            </a>`;

        expect(isRewardsTaskCard(card)).toBe(false);
    });

    test('clicks the matching title when several cards share one URL', async () => {
        document.body.innerHTML = '<iframe id="b_rwFlyout"></iframe>';
        const iframe = document.querySelector('iframe')!;
        const iframeDoc = iframe.contentDocument!;
        iframeDoc.body.innerHTML = `
            <div class="promo_cont"><a href="https://www.bing.com/?form=ML2PCR"><span class="promo-title">更智能的银行服务</span><span class="point">10</span></a></div>
            <div class="promo_cont"><a href="https://www.bing.com/?form=ML2PCR"><span class="promo-title">观看演出</span><span class="point">10</span></a></div>`;
        let clickedTitle = '';
        iframeDoc.addEventListener('click', event => {
            const link = (event.target as Element).closest('a');
            clickedTitle = link?.querySelector('.promo-title')?.textContent || '';
            event.preventDefault();
        });

        const clicked = await clickTaskCardAsync({
            url: 'https://www.bing.com/?form=ML2PCR',
            title: '观看演出',
            status: '未完成',
            points: 10,
            kind: 'search-promotion',
            searchTerms: ['附近音乐会门票'],
            attempts: 0,
            source: 'card'
        });

        expect(clicked).toBe(true);
        expect(clickedTitle).toBe('观看演出');
    });

    test('rejects a card without an actionable link', () => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.textContent = '你已获得 200 积分！';

        expect(isRewardsTaskCard(card)).toBe(false);
    });
});
