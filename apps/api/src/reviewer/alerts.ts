import {
  type CollectionLapseClearedPayload,
  type ExtractionAlertClearedPayload,
  type RequestEventType,
} from '../audit/event-catalogue';

// Alerts on the queue (spec §10.6). An Alert is not stored anywhere: it is
// what a Request's own event stream says is still waiting for a human. This is
// the pure part — given the events, which Alerts are open.

export const ALERT_KINDS = [
  'send_abandoned',
  'collection_lapse',
  'extraction_failure',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Every event type `openAlerts` reads; the rest of the stream is irrelevant to it. */
export const ALERT_EVENT_TYPES = [
  'delivery_alert_raised',
  'collection_lapse_raised',
  'collection_lapse_cleared',
  'extraction_alert_raised',
  'extraction_rerun_queued',
  'job_failed',
  'extraction_alert_cleared',
] as const satisfies readonly RequestEventType[];

/** The events that open an Alert: a Request with none of them has none. */
export const ALERT_RAISED_TYPES = [
  'delivery_alert_raised',
  'collection_lapse_raised',
  'extraction_alert_raised',
] as const satisfies readonly RequestEventType[];

export interface AlertEvent {
  /** The record's sequence: it answers "in what order". */
  id: number;
  type: RequestEventType;
  occurredAt: Date;
}

export interface OpenAlert {
  kind: AlertKind;
  raisedAt: Date;
  /** A Re-run is under way: the Alert waits for it rather than clearing (ADR 0014). */
  deferred: boolean;
  /** Re-runs pressed against this Alert; always 0 for the delivery kinds. */
  rerunAttempts: number;
}

/** The Alerts still open on one Request, oldest first. */
export function openAlerts(events: readonly AlertEvent[]): OpenAlert[] {
  let extraction: OpenAlert | null = null;
  // The two delivery kinds share one slot and one clearing event: the closed
  // catalogue has no `delivery_alert_cleared`, and a send abandoned is cleared
  // with the collection lapse's outcomes (§10.6), so `collection_lapse_cleared`
  // closes whichever of the two is open.
  let delivery: OpenAlert | null = null;
  const opened = (kind: AlertKind, at: Date): OpenAlert => ({
    kind,
    raisedAt: at,
    deferred: false,
    rerunAttempts: 0,
  });
  for (const event of events.toSorted((a, b) => a.id - b.id)) {
    switch (event.type) {
      case 'delivery_alert_raised':
        delivery = opened('send_abandoned', event.occurredAt);
        break;
      case 'collection_lapse_raised':
        delivery = opened('collection_lapse', event.occurredAt);
        break;
      case 'collection_lapse_cleared':
        delivery = null;
        break;
      // One Alert per broken promise, not one per job: a raise while one is
      // already open is the same promise, still broken.
      case 'extraction_alert_raised':
        extraction ??= opened('extraction_failure', event.occurredAt);
        break;
      case 'extraction_rerun_queued':
        if (extraction) {
          extraction.deferred = true;
          extraction.rerunAttempts += 1;
        }
        break;
      case 'job_failed':
        if (extraction) extraction.deferred = false;
        break;
      case 'extraction_alert_cleared':
        extraction = null;
        break;
    }
  }
  return [extraction, delivery]
    .filter((alert) => alert !== null)
    .toSorted((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime());
}

type ReviewerOutcome<T> =
  Extract<T, { clearingReviewerId: string }> extends { outcome: infer O }
    ? O
    : never;

const DELIVERY_OUTCOMES = [
  'reached_requester',
  'could_not_reach_requester',
  'no_action_needed',
] as const satisfies readonly ReviewerOutcome<CollectionLapseClearedPayload>[];

/**
 * What a Reviewer may name when clearing each kind — and nothing else: there
 * is no free text on any clear path, because the count of each outcome is the
 * only measure the service has of how often its silent failures happen.
 * `re_ran` is not here: only the system writes it, when a re-run completes.
 */
export const ALERT_OUTCOMES = {
  send_abandoned: DELIVERY_OUTCOMES,
  collection_lapse: DELIVERY_OUTCOMES,
  extraction_failure: [
    'contacted_requester',
    'abandoned',
  ] as const satisfies readonly ReviewerOutcome<ExtractionAlertClearedPayload>[],
} as const;

export type AlertOutcome<K extends AlertKind = AlertKind> =
  (typeof ALERT_OUTCOMES)[K][number];

export interface AssignedReviewer {
  id: string;
  deactivatedAt: Date | null;
}

/**
 * Whether the signed-in (and so active) Reviewer may clear an Alert. A
 * delivery kind is the approving Reviewer's by name — the act is phoning the
 * Requester they vouched for — until they are deactivated, when it widens to
 * any active Reviewer (ADR 0013). The widening is read off `deactivated_at`
 * here, at read time; nothing is written when it happens. An extraction
 * failure was never by name: anyone may clear it.
 */
export function mayClear(
  kind: AlertKind,
  assigned: AssignedReviewer,
  viewerId: string,
): boolean {
  if (kind === 'extraction_failure') return true;
  return assigned.id === viewerId || assigned.deactivatedAt !== null;
}
