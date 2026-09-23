// The per-IP failed-lookup throttle (spec §9.2): 20 failures in a rolling
// hour, then a flat 1-hour block. Deliberately not `login-throttle.ts`'s
// exponential backoff — a different policy (count-then-block, not
// escalating-delay) for a different threat (walking the token space, not
// guessing a password), so it gets its own shape rather than reusing that
// table's.
//
// Pure state transition, independent of storage, so the policy is testable
// without a database (mirrors `login-throttle.ts#backoffSeconds`).

export const FAILURE_LIMIT = 20;
export const WINDOW_MS = 60 * 60 * 1000;
export const BLOCK_MS = 60 * 60 * 1000;

export interface ThrottleState {
  failureCount: number;
  windowStart: Date;
  blockedUntil: Date | null;
}

export function isBlocked(
  state: ThrottleState | undefined,
  now: Date,
): boolean {
  return (
    state?.blockedUntil !== null &&
    state?.blockedUntil !== undefined &&
    state.blockedUntil.getTime() > now.getTime()
  );
}

/** The next state after one more failure. A stale window (older than an hour) resets rather than accumulates. */
export function recordFailure(
  state: ThrottleState | undefined,
  now: Date,
): ThrottleState {
  const stale =
    !state || now.getTime() - state.windowStart.getTime() >= WINDOW_MS;
  const windowStart = stale ? now : state.windowStart;
  const failureCount = stale ? 1 : state.failureCount + 1;
  const blockedUntil =
    failureCount >= FAILURE_LIMIT
      ? new Date(now.getTime() + BLOCK_MS)
      : stale
        ? null
        : (state?.blockedUntil ?? null);
  return { failureCount, windowStart, blockedUntil };
}
