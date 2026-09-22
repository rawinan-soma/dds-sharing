// Stall detection, not a duration cap (spec §7.6): the job fails if no Report
// code completes within the window, no matter what it was doing when the
// clock ran out. Lack of progress is the fault signal; a hard ceiling on the
// job's own duration was rejected as dead code, because duration is a
// legitimate variable — the code-level retry alone can legitimately take
// longer than the stall window against a consistently slow upstream, and
// that IS meant to be pre-empted as a stall (§7.6: "automatically, not
// flagged for a human, because a stalled job holds the single upstream slot").

export class StallError extends Error {
  constructor(idleMs: number) {
    super(`No Report code completed for ${idleMs}ms`);
    this.name = 'StallError';
  }
}

export interface StallGuardClock {
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const SYSTEM_CLOCK: StallGuardClock = {
  now: () => Date.now(),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
};

/**
 * `guard.promise` rejects with {@link StallError} once `stallMs` elapses since
 * the last {@link StallGuard.touch}. Race it against the pipeline's own
 * promise; call {@link StallGuard.dispose} once the race is settled either
 * way, or the timer outlives the job.
 */
export class StallGuard {
  readonly promise: Promise<never>;
  private lastTouch: number;
  private handle: unknown;
  private disposed = false;
  private reject!: (error: StallError) => void;

  constructor(
    private readonly stallMs: number,
    private readonly clock: StallGuardClock = SYSTEM_CLOCK,
  ) {
    this.lastTouch = clock.now();
    this.promise = new Promise<never>((_, reject) => {
      this.reject = reject;
    });
    this.arm();
  }

  touch(): void {
    this.lastTouch = this.clock.now();
  }

  dispose(): void {
    this.disposed = true;
    if (this.handle !== undefined) this.clock.clearTimer(this.handle);
  }

  private arm(): void {
    const elapsed = this.clock.now() - this.lastTouch;
    const remaining = this.stallMs - elapsed;
    if (remaining <= 0) {
      this.reject(new StallError(elapsed));
      return;
    }
    this.handle = this.clock.setTimer(() => {
      if (this.disposed) return;
      this.arm();
    }, remaining);
  }
}
