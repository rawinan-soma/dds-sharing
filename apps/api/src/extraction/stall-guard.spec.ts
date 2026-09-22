import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StallError, StallGuard } from './stall-guard';

describe('StallGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rejects with StallError once the window elapses with no touch', async () => {
    const guard = new StallGuard(1000);
    const settled = guard.promise.catch((e: unknown) => e);
    vi.advanceTimersByTime(1000);
    const error = await settled;
    expect(error).toBeInstanceOf(StallError);
    guard.dispose();
  });

  it('never fires while touched more often than the window', async () => {
    const guard = new StallGuard(1000);
    let fired = false;
    guard.promise.catch(() => {
      fired = true;
    });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(600);
      guard.touch();
    }
    expect(fired).toBe(false);
    guard.dispose();
  });

  it('does nothing once disposed', () => {
    const guard = new StallGuard(1000);
    guard.promise.catch(() => undefined);
    guard.dispose();
    // No unhandled rejection, no throw, from advancing time after dispose.
    vi.advanceTimersByTime(10_000);
  });
});
