import { describe, expect, it } from 'vitest';
import { isBlocked, recordFailure } from './throttle-policy';

const at = (iso: string) => new Date(iso);

describe('isBlocked', () => {
  it('is false with no prior state', () => {
    expect(isBlocked(undefined, at('2026-01-01T00:00:00Z'))).toBe(false);
  });

  it('is false once blockedUntil has passed', () => {
    const state = {
      failureCount: 20,
      windowStart: at('2026-01-01T00:00:00Z'),
      blockedUntil: at('2026-01-01T01:00:00Z'),
    };
    expect(isBlocked(state, at('2026-01-01T01:00:01Z'))).toBe(false);
  });

  it('is true while blockedUntil is still ahead', () => {
    const state = {
      failureCount: 20,
      windowStart: at('2026-01-01T00:00:00Z'),
      blockedUntil: at('2026-01-01T01:00:00Z'),
    };
    expect(isBlocked(state, at('2026-01-01T00:59:59Z'))).toBe(true);
  });
});

describe('recordFailure', () => {
  it('starts a fresh window at 1 on the first failure', () => {
    const state = recordFailure(undefined, at('2026-01-01T00:00:00Z'));
    expect(state).toEqual({
      failureCount: 1,
      windowStart: at('2026-01-01T00:00:00Z'),
      blockedUntil: null,
    });
  });

  it('accumulates failures inside the same hour', () => {
    let state = recordFailure(undefined, at('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 18; i++) {
      state = recordFailure(state, at('2026-01-01T00:00:01Z'));
    }
    expect(state.failureCount).toBe(19);
    expect(state.blockedUntil).toBeNull();
  });

  it('blocks for an hour on the 20th failure inside the window', () => {
    let state = recordFailure(undefined, at('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 18; i++) {
      state = recordFailure(state, at('2026-01-01T00:00:01Z'));
    }
    state = recordFailure(state, at('2026-01-01T00:30:00Z'));
    expect(state.failureCount).toBe(20);
    expect(state.blockedUntil).toEqual(at('2026-01-01T01:30:00Z'));
  });

  it('resets the count when the window is stale, even mid-count', () => {
    const state = recordFailure(
      {
        failureCount: 15,
        windowStart: at('2026-01-01T00:00:00Z'),
        blockedUntil: null,
      },
      at('2026-01-01T01:00:01Z'),
    );
    expect(state).toEqual({
      failureCount: 1,
      windowStart: at('2026-01-01T01:00:01Z'),
      blockedUntil: null,
    });
  });

  it('lets a fresh failure after the block expires reset the window rather than immediately re-blocking', () => {
    const state = recordFailure(
      {
        failureCount: 20,
        windowStart: at('2026-01-01T00:00:00Z'),
        blockedUntil: at('2026-01-01T01:00:00Z'),
      },
      at('2026-01-01T01:00:01Z'),
    );
    expect(state).toEqual({
      failureCount: 1,
      windowStart: at('2026-01-01T01:00:01Z'),
      blockedUntil: null,
    });
  });
});
