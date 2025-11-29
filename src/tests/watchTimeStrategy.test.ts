import { WatchTimeStrategy } from '../strategies/watchTimeStrategy';

describe('WatchTimeStrategy', () => {
    test('estimates watch time based on event count', () => {
        const strategy = new WatchTimeStrategy();
        const events = [{ id: '1' }, { id: '2' }] as any[];
        expect(strategy.estimateWatchTime(events)).toBe(10);
        expect(strategy.estimateWatchTime([])).toBe(0);
    });
});
