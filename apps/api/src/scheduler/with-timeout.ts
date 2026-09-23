/**
 * Fails `work` if it has not settled within `ms`. For the tick's MinIO calls:
 * the pass runs its jobs inline under one lock (§15.3), so a call that hangs
 * rather than fails would stall every job after it. Timed out, it fails its
 * step instead — which withholds the heartbeat, so it still reaches the banner.
 * The underlying call is not cancelled; its result, if any, is ignored.
 */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
