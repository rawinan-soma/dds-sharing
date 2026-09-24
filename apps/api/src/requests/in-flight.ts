import { type extractionJobStatus } from '../db/schema';
import { type RequestState, TERMINAL_REQUEST_STATES } from './request-state';

// The in-flight list (spec §10.9): approved, and not yet terminal. This is the
// pure part — given what is true of a Request now, whether it is in flight and
// what can physically be done to it. Nothing here is stored: a Request is on
// the list because of what is true about it, not because something wrote it
// there.

/** The newest `extraction_job` row's status. */
export type JobStatus = (typeof extractionJobStatus.enumValues)[number];

/** How the row reads. */
export type ExtractionState = 'extracting' | 'ready' | 'failed';

export interface InFlightFacts {
  state: RequestState;
  /** Null only if the job row has not landed, which approval rules out. */
  job: JobStatus | null;
  /** The current Download token — the newest one no Re-run revoked. */
  token: { expiresAt: Date; attempts: number } | null;
}

export interface InFlightActions {
  rerun: boolean;
  resend: boolean;
}

export interface InFlightRow {
  extraction: ExtractionState;
  linkExpiresAt: Date | null;
  actions: InFlightActions;
}

/**
 * The Request's state as it already is, whether or not the tick has recorded
 * it yet: an approved Request whose current link lapsed with no Attempt has
 * ended (ADR 0016), and no Reviewer action may revive it in the minute before
 * the tick writes `expired_uncollected`.
 */
export function settledState(
  state: RequestState,
  token: InFlightFacts['token'],
  now: Date,
): RequestState {
  const lapsed =
    state === 'approved' &&
    token !== null &&
    token.attempts === 0 &&
    token.expiresAt <= now;
  return lapsed ? 'expired_uncollected' : state;
}

/** Null when the Request is not in flight: never approved, or terminal. */
export function inFlightRow(
  facts: InFlightFacts,
  now: Date,
): InFlightRow | null {
  const state = settledState(facts.state, facts.token, now);
  if (
    state === 'pending' ||
    (TERMINAL_REQUEST_STATES as readonly RequestState[]).includes(state)
  ) {
    return null;
  }
  const extraction = extractionState(facts.job);
  // Gated by what is physically possible, not by policy: a second job under
  // concurrency 1 would queue behind the first and duplicate it, and there is
  // no Delivery to resend before one was sent — nor after a failure.
  return {
    extraction,
    linkExpiresAt: facts.token?.expiresAt ?? null,
    actions: {
      rerun: extraction !== 'extracting',
      resend: extraction === 'ready' && facts.token !== null,
    },
  };
}

function extractionState(job: JobStatus | null): ExtractionState {
  switch (job) {
    case 'succeeded':
      return 'ready';
    case 'failed':
      return 'failed';
    default:
      return 'extracting';
  }
}
