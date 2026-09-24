import { describe, expect, it } from 'vitest';
import { inFlightRow } from './in-flight';

const ict = (local: string) => new Date(`${local}:00+07:00`);
const now = ict('2026-09-22T10:00');

// The in-flight list (§10.9): approved and not yet terminal, and what can
// physically be done to each row — derived, never stored.
describe('inFlightRow', () => {
  it('reads a queued or running job as extracting, with nothing to do', () => {
    for (const job of ['queued', 'running'] as const) {
      expect(inFlightRow({ state: 'approved', job, token: null }, now)).toEqual(
        {
          extraction: 'extracting',
          linkExpiresAt: null,
          actions: { rerun: false, resend: false },
        },
      );
    }
  });

  it('offers Re-run and resend on a ready, uncollected Extract, with the time left on its link', () => {
    const expiresAt = ict('2026-09-24T09:00');
    expect(
      inFlightRow(
        {
          state: 'approved',
          job: 'succeeded',
          token: { expiresAt, attempts: 0 },
        },
        now,
      ),
    ).toEqual({
      extraction: 'ready',
      linkExpiresAt: expiresAt,
      actions: { rerun: true, resend: true },
    });
  });

  it('offers only Re-run on a failed extraction: there is no Delivery to resend', () => {
    expect(
      inFlightRow({ state: 'approved', job: 'failed', token: null }, now),
    ).toEqual({
      extraction: 'failed',
      linkExpiresAt: null,
      actions: { rerun: true, resend: false },
    });
  });

  it('keeps the earlier link live while a Re-run extracts, and still offers nothing', () => {
    const expiresAt = ict('2026-09-24T09:00');
    expect(
      inFlightRow(
        {
          state: 'approved',
          job: 'running',
          token: { expiresAt, attempts: 0 },
        },
        now,
      ),
    ).toEqual({
      extraction: 'extracting',
      linkExpiresAt: expiresAt,
      actions: { rerun: false, resend: false },
    });
  });

  it('offers only Re-run after a failed Re-run: the earlier link is still live but no resend of a failure', () => {
    const expiresAt = ict('2026-09-24T09:00');
    expect(
      inFlightRow(
        { state: 'approved', job: 'failed', token: { expiresAt, attempts: 0 } },
        now,
      )?.actions,
    ).toEqual({ rerun: true, resend: false });
  });

  it.each([
    'pending',
    'rejected',
    'expired',
    'collected',
    'expired_uncollected',
    'abandoned',
  ] as const)('holds no %s Request', (state) => {
    expect(
      inFlightRow({ state, job: 'succeeded', token: null }, now),
    ).toBeNull();
  });

  it('holds no Request whose link lapsed uncollected, before the tick has recorded it (ADR 0016)', () => {
    expect(
      inFlightRow(
        {
          state: 'approved',
          job: 'succeeded',
          token: { expiresAt: ict('2026-09-22T09:59'), attempts: 0 },
        },
        now,
      ),
    ).toBeNull();
  });
});
