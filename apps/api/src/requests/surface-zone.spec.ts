import { describe, expect, it } from 'vitest';
import { surfaceZone } from './surface-zone';

// A Request appears exactly once on the Reviewer surface, in whichever zone
// carries the action it needs (§10.6, §10.9).
describe('surfaceZone', () => {
  it('puts a pending Request on the queue', () => {
    expect(surfaceZone('pending', false)).toBe('queue');
  });

  it('puts an approved Request with an open Alert in the Alert section only', () => {
    expect(surfaceZone('approved', true)).toBe('alerts');
  });

  it('returns it to the in-flight list once the Alert is cleared', () => {
    expect(surfaceZone('approved', false)).toBe('in_flight');
  });

  it.each([
    'collected',
    'expired_uncollected',
    'abandoned',
    'rejected',
    'expired',
  ] as const)(
    'drops a %s Request from the surface once nothing is open',
    (state) => {
      expect(surfaceZone(state, false)).toBeNull();
    },
  );
});
