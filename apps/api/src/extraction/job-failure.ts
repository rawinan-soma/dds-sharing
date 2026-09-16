import {
  UpstreamAuthError,
  UpstreamClientError,
  UpstreamRetriesExhaustedError,
} from "../upstream/upstream-client-errors.js";
import { StallError } from "./stall-watchdog.js";

/** The closed cause taxonomy `job_failed` carries (spec §12.4). */
export type JobFailureCause =
  | "upstream_5xx"
  | "auth_expiry"
  | "completeness_mismatch"
  | "stall"
  | "internal";

/**
 * The normalised shape every extraction failure reduces to before it
 * reaches `job_failed` (spec §7.9, §10.6, §12.4). Named `failureCause`
 * rather than `cause` to avoid colliding with `Error.prototype.cause`,
 * which still carries the original error via the `options` constructor arg.
 */
export class ExtractionFailure extends Error {
  constructor(
    readonly failureCause: JobFailureCause,
    readonly xRequestId: string | null,
    originalError?: unknown,
  ) {
    super(`extraction job failed: ${failureCause}`, { cause: originalError });
  }
}

export class CompletenessMismatchError extends Error {
  constructor(
    readonly groupCode: string,
    readonly rowsReceived: number,
    readonly totalItems: number,
    readonly xRequestId: string | null,
  ) {
    super(
      `completeness mismatch for group ${groupCode}: received ${rowsReceived}, meta.total_items ${totalItems}`,
    );
  }
}

/**
 * Reduces whatever this attempt threw to the closed cause taxonomy
 * `job_failed` carries. A retryable upstream fault that exhausted its
 * budget and an auth rejection are the two upstream-shaped outcomes
 * (§5.5); a completeness mismatch and a stall are this job's own
 * invariants (§7.5, §7.6); anything else is `internal` — a fault this
 * design did not anticipate, never silently reclassified as one that was.
 */
export function classifyExtractionFailure(error: unknown): ExtractionFailure {
  if (error instanceof ExtractionFailure) return error;

  if (error instanceof CompletenessMismatchError) {
    return new ExtractionFailure(
      "completeness_mismatch",
      error.xRequestId,
      error,
    );
  }

  if (error instanceof StallError) {
    return new ExtractionFailure("stall", null, error);
  }

  if (error instanceof UpstreamAuthError) {
    return new ExtractionFailure("auth_expiry", error.requestId ?? null, error);
  }

  if (error instanceof UpstreamRetriesExhaustedError) {
    return new ExtractionFailure(
      "upstream_5xx",
      error.lastError.requestId ?? null,
      error,
    );
  }

  if (error instanceof UpstreamClientError) {
    // A non-retryable client-side rejection (validation/range/page-size/
    // meta-mismatch) that reached here means this job built a malformed
    // request — a bug in this codebase, not an upstream-load fact.
    return new ExtractionFailure("internal", error.requestId ?? null, error);
  }

  return new ExtractionFailure("internal", null, error);
}
