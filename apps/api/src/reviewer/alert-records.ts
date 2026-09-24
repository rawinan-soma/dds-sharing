import { and, asc, eq, inArray } from 'drizzle-orm';
import { type Executor, writeRequestEvent } from '../audit/write-request-event';
import { requestEvent } from '../db/schema';
import {
  ALERT_EVENT_TYPES,
  type AlertEvent,
  type OpenAlert,
  openAlerts,
} from './alerts';

// The Alert as the record holds it: read out of `request_event`, never out of
// a column of its own. Plain functions over an executor, so the writers that
// raise and clear an Alert can run them inside their own transaction.

export interface RecordedAlertEvent extends AlertEvent {
  requestId: string;
  payload: unknown;
}

/** The alert-relevant events of the given Requests, in record order. */
export async function alertEventsOf(
  db: Executor,
  requestIds: readonly string[],
): Promise<RecordedAlertEvent[]> {
  if (requestIds.length === 0) return [];
  return db
    .select({
      requestId: requestEvent.requestId,
      id: requestEvent.id,
      type: requestEvent.type,
      occurredAt: requestEvent.occurredAt,
      payload: requestEvent.payload,
    })
    .from(requestEvent)
    .where(
      and(
        inArray(requestEvent.requestId, [...requestIds]),
        inArray(requestEvent.type, [...ALERT_EVENT_TYPES]),
      ),
    )
    .orderBy(asc(requestEvent.id));
}

export async function openAlertsOf(
  db: Executor,
  requestId: string,
): Promise<OpenAlert[]> {
  return openAlerts(await alertEventsOf(db, [requestId]));
}

/**
 * The Reviewer every Alert on a Request is assigned to: the one who approved
 * it. Never rewritten — not even when they are deactivated (ADR 0013).
 */
export async function approvingReviewerId(
  db: Executor,
  requestId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ reviewerId: requestEvent.reviewerId })
    .from(requestEvent)
    .where(
      and(
        eq(requestEvent.requestId, requestId),
        eq(requestEvent.type, 'approved'),
      ),
    )
    .limit(1);
  return row?.reviewerId ?? null;
}

/**
 * A failed job raises the extraction-failure Alert for its Request — unless
 * one is already open. The Alert belongs to the broken promise, not to the
 * job: a Re-run that fails too leaves the same Alert open with another
 * attempt on it, and raises no second one (ADR 0014).
 */
export async function raiseExtractionAlert(
  db: Executor,
  requestId: string,
  occurredAt: Date,
): Promise<boolean> {
  const open = await openAlertsOf(db, requestId);
  if (open.some((a) => a.kind === 'extraction_failure')) return false;
  await writeRequestEvent(db, {
    requestId,
    type: 'extraction_alert_raised',
    occurredAt,
    actor: { actorType: 'system' },
    payload: {},
  });
  return true;
}

/**
 * A late collection clears its open collection lapse (§10.6) — as `system`,
 * never `reviewer`: nobody gets credit for a call they did not make, and the
 * lapse count must stay honest.
 */
export async function clearLapseOnLateCollection(
  db: Executor,
  requestId: string,
  occurredAt: Date,
): Promise<void> {
  const open = await openAlertsOf(db, requestId);
  if (!open.some((a) => a.kind === 'collection_lapse')) return;
  const assignedReviewerId = await approvingReviewerId(db, requestId);
  if (!assignedReviewerId) return;
  await writeRequestEvent(db, {
    requestId,
    type: 'collection_lapse_cleared',
    occurredAt,
    actor: { actorType: 'system' },
    payload: { outcome: null, assignedReviewerId, clearingReviewerId: null },
  });
}
