// Everything the extraction pipeline (spec §7) knows about its own timing and
// limits. Verified behaviour and the ticket's own numbers, not guesses.

export const EXTRACTION_QUEUE_NAME = 'extraction';

/*
 * Global extraction concurrency is 1 (spec §13.2). Keyed on nothing — not a
 * conservative guess, what the measurements force: eight concurrent upstream
 * calls degraded from ~3.9 s to ~14.3 s each with zero throughput gained,
 * because upstream serialises them. `N` is configurable in the sense that it
 * is a plain constant; do not tune it upward expecting throughput — the
 * failure to fear is DDC noticing the traffic and revoking the one bearer
 * token, which no retry recovers from, and more parallel calls only spend
 * more of that token's standing.
 */
export const EXTRACTION_CONCURRENCY = 1;

export const EXTRACTION_DEFAULTS = {
  /** The Report code is the atomic unit: 3 attempts, from page 1 every time. */
  codeMaxAttempts: 3,
  /** Exponential, between code-level attempts: 1 s, then 2 s. */
  codeBackoffBaseMs: 1_000,
  /**
   * Not a duration cap — lack of progress is the fault signal (spec §7.6). The
   * widest group is ten calls at ~3.5 s each, so 2 minutes is already ~30x the
   * expected gap between one Report code finishing and the next.
   */
  stallMs: 120_000,
} as const;

/** A floor, never a projection from row count or the Probe (spec §7.8). */
export const DISK_FLOOR_BYTES = 1024 * 1024 * 1024;

/**
 * How often a job below the disk floor rechecks. Not tuned against anything
 * in the spec — "wait loudly rather than run and die at the upload step"
 * names the behaviour, not a cadence, and disk pressure on a volume this
 * small (§13.5) is an operator-timescale event, not a seconds one.
 */
export const DISK_RECHECK_DELAY_MS = 5 * 60_000;
