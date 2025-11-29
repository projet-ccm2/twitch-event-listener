import crypto from 'crypto';
import { secureId, secureRandomInt, secureRandomIntRange } from '../utils/random';

describe('random utilities', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('secureId uses randomUUID when available', () => {
        const spy = jest
            .spyOn(crypto, 'randomUUID')
            .mockReturnValue('123e4567-e89b-12d3-a456-426614174000');
        const id = secureId();
        expect(id).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(spy).toHaveBeenCalled();
    });

    test('secureRandomInt respects bounds', () => {
        const value = secureRandomInt(10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10);
        expect(() => secureRandomInt(0)).toThrow('maxExclusive must be > 0');
    });

    test('secureRandomIntRange enforces range', () => {
        const value = secureRandomIntRange(5, 10);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThan(10);
        expect(() => secureRandomIntRange(5, 5)).toThrow('Invalid range');
    });
});
