import { describe, expect, it } from 'vitest';
import { rankPending } from './review-queue';

const ict = (local: string) => new Date(`${local}:00+07:00`);

const row = (reference: string, submitted: string) => ({
  id: `id-${reference}`,
  reference,
  submittedAt: ict(submitted),
});

describe('rankPending (§10.1)', () => {
  const now = ict('2026-09-21T12:00');

  it('lists oldest first, whatever order the rows arrive in', () => {
    const ranked = rankPending(
      [
        row('B', '2026-09-21T10:00'),
        row('C', '2026-09-21T11:00'),
        row('A', '2026-09-21T09:00'),
      ],
      now,
    );
    expect(ranked.map((r) => r.reference)).toEqual(['A', 'B', 'C']);
  });

  it('says how many Requests are ahead, and nothing more precise', () => {
    const ranked = rankPending(
      [
        row('A', '2026-09-21T09:00'),
        row('B', '2026-09-21T10:00'),
        row('C', '2026-09-21T11:00'),
      ],
      now,
    );
    expect(ranked.map((r) => r.ahead)).toEqual([0, 1, 2]);
  });

  it('breaks a tie in submit time by reference, so the order is stable', () => {
    const ranked = rankPending(
      [row('REQ-2', '2026-09-21T09:00'), row('REQ-1', '2026-09-21T09:00')],
      now,
    );
    expect(ranked.map((r) => r.reference)).toEqual(['REQ-1', 'REQ-2']);
  });

  it('marks a Request past 24 business hours not actionable, computed now', () => {
    const [stale, live] = rankPending(
      [row('OLD', '2026-09-14T09:00'), row('NEW', '2026-09-21T09:00')],
      now,
    );
    expect(stale).toMatchObject({ reference: 'OLD', expired: true });
    expect(stale.minutesLeft).toBe(0);
    expect(live).toMatchObject({ reference: 'NEW', expired: false });
    expect(live.minutesLeft).toBe(21 * 60);
  });

  it('does not count an expired Request as ahead of a live one', () => {
    const ranked = rankPending(
      [row('OLD', '2026-09-14T09:00'), row('NEW', '2026-09-21T09:00')],
      now,
    );
    expect(ranked.find((r) => r.reference === 'NEW')?.ahead).toBe(0);
    expect(ranked.find((r) => r.reference === 'OLD')?.ahead).toBeNull();
  });

  it('reads the clock again on every call: nothing is remembered', () => {
    const rows = [row('A', '2026-09-21T09:00')];
    expect(rankPending(rows, ict('2026-09-23T12:00'))[0].expired).toBe(false);
    expect(rankPending(rows, ict('2026-09-24T12:00'))[0].expired).toBe(true);
  });
});
