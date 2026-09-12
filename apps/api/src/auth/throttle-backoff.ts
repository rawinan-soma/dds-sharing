// No lockout, ever — throttling only (spec §17.5). Exponential backoff,
// capped near 30 seconds: at one attempt per 30 seconds an attacker holding
// the correct password still cannot brute-force six digits, but nobody —
// including an anonymous internet stranger — can lock a named account out.
export const THROTTLE_CAP_SECONDS = 30;

/** Seconds to wait before the next attempt, given how many have already failed. */
export function backoffSeconds(failureCount: number): number {
  return Math.min(THROTTLE_CAP_SECONDS, 2 ** failureCount);
}
