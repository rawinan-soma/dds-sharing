/**
 * The 2-minute no-progress detector (spec §7.6): "the job fails if no code
 * completes for 2 minutes." Not a duration cap on the job as a whole — a
 * detector of a lack of progress, reset by every code that finishes.
 */
export const STALL_TIMEOUT_MS = 2 * 60 * 1000;

export class StallError extends Error {
  constructor() {
    super(`no Report code completed within ${STALL_TIMEOUT_MS}ms`);
  }
}

/**
 * Races one code's fetch against the stall timer. The timer is a fresh one
 * per call — the caller resets it just by calling this again for the next
 * code — so "no code completes for 2 minutes" reduces to "no single call to
 * this function ever takes longer than 2 minutes to settle."
 *
 * A stalled call is never awaited to completion: `race` failing ends this
 * job for good (§7.6 — killed automatically, never flagged for a human), so
 * there is nothing to gain from waiting the slow promise out.
 */
export function raceAgainstStall<T>(
  work: () => Promise<T>,
  timeoutMs: number = STALL_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StallError()), timeoutMs);
    work().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}
