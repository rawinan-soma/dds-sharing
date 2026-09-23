import { describe, expect, it } from 'vitest';
import { schedulerStatus } from './scheduler-health';

const now = new Date('2026-09-21T03:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60_000;

describe('schedulerStatus', () => {
  it('is ok with a heartbeat inside five minutes and nothing overdue', () => {
    expect(
      schedulerStatus({ lastBeatAt: ago(5 * MINUTE), overdueObjects: 0 }, now),
    ).toEqual({ status: 'ok' });
  });

  it('is degraded once the heartbeat is more than five minutes old', () => {
    expect(
      schedulerStatus(
        { lastBeatAt: ago(5 * MINUTE + 1), overdueObjects: 0 },
        now,
      ),
    ).toMatchObject({ status: 'degraded' });
  });

  it('is degraded when the tick has never beaten at all', () => {
    expect(
      schedulerStatus({ lastBeatAt: null, overdueObjects: 0 }, now),
    ).toMatchObject({ status: 'degraded' });
  });

  it('is degraded by an object still present an hour past its token, even with a fresh heartbeat', () => {
    expect(
      schedulerStatus({ lastBeatAt: ago(MINUTE), overdueObjects: 1 }, now),
    ).toMatchObject({ status: 'degraded' });
  });

  it('never carries a count in its reason: the health document is statuses only', () => {
    const health = schedulerStatus(
      { lastBeatAt: ago(MINUTE), overdueObjects: 7 },
      now,
    );
    expect(JSON.stringify(health)).not.toContain('7');
  });
});
