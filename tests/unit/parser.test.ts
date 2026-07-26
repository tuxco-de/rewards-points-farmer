import { getCardCompletionStatus, parseEarnedProgressText } from '../../src/parser';

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
});
