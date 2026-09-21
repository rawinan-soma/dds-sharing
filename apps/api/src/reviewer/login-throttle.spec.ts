import { describe, expect, it } from 'vitest';
import { backoffSeconds } from './login-throttle';

describe('login backoff (§17.5)', () => {
  it('lets the first failure retry at once, then doubles', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffSeconds)).toEqual([0, 1, 2, 4, 8, 16]);
  });

  it('caps at 30 seconds, however many failures', () => {
    expect(backoffSeconds(7)).toBe(30);
    expect(backoffSeconds(50)).toBe(30);
    expect(backoffSeconds(10_000)).toBe(30);
  });
});
