import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { type RequestEventPayloads } from '../audit/event-catalogue';
import { writeRequestEvent } from '../audit/write-request-event';
import { CLOCK, type Clock } from '../clock/clock';
import { DB, type Db } from '../db/database.module';
import { request, requestContact, requestEvent, reviewer } from '../db/schema';
import { moveRequestState } from '../requests/move-request-state';
import { type RequestState } from '../requests/request-state';
import { type SurfaceZone, surfaceZone } from '../requests/surface-zone';
import {
  alertEventsOf,
  approvingReviewerId,
  type RecordedAlertEvent,
} from './alert-records';
import {
  ALERT_OUTCOMES,
  ALERT_RAISED_TYPES,
  type AlertKind,
  type AlertOutcome,
  type OpenAlert,
  mayClear,
  openAlerts,
} from './alerts';

const HOUR_MS = 60 * 60 * 1000;

export interface AlertRow {
  requestId: string;
  reference: string;
  requesterName: string;
  kind: AlertKind;
  raisedAt: string;
  /** A Re-run is under way: nothing to clear until it settles (ADR 0014). */
  deferred: boolean;
  rerunAttempts: number;
  /** The approving Reviewer, by name, whether or not still active (ADR 0013). */
  assignedTo: { displayName: string; active: boolean };
  /** The closed set this kind is cleared from. */
  outcomes: readonly AlertOutcome[];
  /** Whether the Reviewer reading this may clear it now. */
  clearable: boolean;
  /** A collection lapse's silence: wall-clock hours since the Delivery. */
  silentHours: number | null;
}

export interface AlertDetail {
  alerts: AlertRow[];
  /** Live, from the Request, never the Snapshot: phoning needs them (ADR 0015). */
  contact: {
    name: string;
    surname: string;
    tel: string;
    email: string;
    workplace: string;
  };
}

export type ClearOutcome =
  | { status: 'cleared'; clearedAt: string; zone: SurfaceZone | null }
  | { status: 'not_open' }
  | { status: 'invalid_outcome' }
  | { status: 'deferred' }
  | { status: 'not_permitted' };

interface AlertedRequest {
  requestId: string;
  reference: string;
  name: string;
  surname: string;
  assignedId: string;
  assignedName: string;
  assignedDeactivatedAt: Date | null;
}

// The must-clear items of §10.6: read from the event stream on every ask, and
// cleared only by naming an outcome from the kind's closed set.
@Injectable()
export class Alerts {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Every open Alert on the surface, oldest first, as `viewerId` sees it. */
  async list(viewerId: string): Promise<AlertRow[]> {
    const raised = this.db
      .selectDistinct({ id: requestEvent.requestId })
      .from(requestEvent)
      .where(inArray(requestEvent.type, [...ALERT_RAISED_TYPES]));
    const ids = (await raised).map((r) => r.id);
    return this.rowsFor(ids, viewerId);
  }

  /** Null when the Request has no open Alert. */
  async detail(
    requestId: string,
    viewerId: string,
  ): Promise<AlertDetail | null> {
    const alerts = await this.rowsFor([requestId], viewerId);
    if (alerts.length === 0) return null;
    const [contact] = await this.db
      .select({
        name: requestContact.name,
        surname: requestContact.surname,
        tel: requestContact.tel,
        email: requestContact.email,
        workplace: requestContact.workplace,
      })
      .from(requestContact)
      .where(eq(requestContact.requestId, requestId));
    return { alerts, contact };
  }

  /**
   * Clears one open Alert with an outcome from its kind's closed set. The
   * Request row is locked first, so two Reviewers pressing at once clear it
   * once. Both the assigned and the clearing Reviewer go on the event — they
   * differ whenever someone else cleared it (§10.6).
   */
  async clear(
    requestId: string,
    kind: AlertKind,
    outcome: string,
    viewerId: string,
  ): Promise<ClearOutcome> {
    const now = this.clock.now();
    return this.db.transaction(async (tx): Promise<ClearOutcome> => {
      const [row] = await tx
        .select({ state: request.state })
        .from(request)
        .where(eq(request.id, requestId))
        .for('update');
      if (!row) return { status: 'not_open' };

      const open = openAlerts(await alertEventsOf(tx, [requestId]));
      const alert = open.find((a) => a.kind === kind);
      const assignedId = await approvingReviewerId(tx, requestId);
      if (!alert || !assignedId) return { status: 'not_open' };
      if (!isOutcomeOf(kind, outcome)) return { status: 'invalid_outcome' };
      if (alert.deferred) return { status: 'deferred' };

      const [assigned] = await tx
        .select({ deactivatedAt: reviewer.deactivatedAt })
        .from(reviewer)
        .where(eq(reviewer.id, assignedId));
      if (!mayClear(kind, { id: assignedId, ...assigned }, viewerId)) {
        return { status: 'not_permitted' };
      }

      const actor = { actorType: 'reviewer' as const, reviewerId: viewerId };
      let state: RequestState = row.state;
      if (kind === 'extraction_failure') {
        await writeRequestEvent(tx, {
          requestId,
          type: 'extraction_alert_cleared',
          occurredAt: now,
          actor,
          payload: {
            outcome: outcome as AlertOutcome<'extraction_failure'>,
            assignedReviewerId: assignedId,
            clearingReviewerId: viewerId,
            rerunAttempts: alert.rerunAttempts,
          },
        });
        // Abandoned is terminal (§10.9): nothing remains to be done.
        if (
          outcome === 'abandoned' &&
          (await moveRequestState(tx, requestId, 'approved', 'abandoned'))
        ) {
          state = 'abandoned';
        }
      } else {
        // A send abandoned has no clearing event of its own: the closed
        // catalogue clears it with the collection lapse's (§10.6).
        await writeRequestEvent(tx, {
          requestId,
          type: 'collection_lapse_cleared',
          occurredAt: now,
          actor,
          payload: {
            outcome: outcome as AlertOutcome<'collection_lapse'>,
            assignedReviewerId: assignedId,
            clearingReviewerId: viewerId,
          },
        });
      }
      return {
        status: 'cleared',
        clearedAt: now.toISOString(),
        zone: surfaceZone(state, open.length > 1),
      };
    });
  }

  private async rowsFor(
    requestIds: readonly string[],
    viewerId: string,
  ): Promise<AlertRow[]> {
    const events = await alertEventsOf(this.db, requestIds);
    const byRequest = new Map<string, RecordedAlertEvent[]>();
    for (const event of events) {
      const stream = byRequest.get(event.requestId) ?? [];
      stream.push(event);
      byRequest.set(event.requestId, stream);
    }
    const open = new Map<string, OpenAlert[]>();
    for (const [id, stream] of byRequest) {
      const alerts = openAlerts(stream);
      if (alerts.length > 0) open.set(id, alerts);
    }
    if (open.size === 0) return [];

    const requests = await this.alertedRequests([...open.keys()]);
    const now = this.clock.now();
    return requests
      .flatMap((r) =>
        open
          .get(r.requestId)!
          .map((alert) =>
            toRow(r, alert, byRequest.get(r.requestId)!, viewerId, now),
          ),
      )
      .toSorted(
        (a, b) =>
          a.raisedAt.localeCompare(b.raisedAt) ||
          a.reference.localeCompare(b.reference),
      );
  }

  // The list reads a name and nothing else of the contact: the rest is the
  // detail's to show, one Request at a time (§12.3).
  private async alertedRequests(ids: string[]): Promise<AlertedRequest[]> {
    return this.db
      .select({
        requestId: request.id,
        reference: request.reference,
        name: requestContact.name,
        surname: requestContact.surname,
        assignedId: reviewer.id,
        assignedName: reviewer.displayName,
        assignedDeactivatedAt: reviewer.deactivatedAt,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .innerJoin(
        requestEvent,
        and(
          eq(requestEvent.requestId, request.id),
          eq(requestEvent.type, 'approved'),
        ),
      )
      .innerJoin(reviewer, eq(reviewer.id, sql`${requestEvent.reviewerId}`))
      .where(inArray(request.id, ids));
  }
}

function isOutcomeOf(kind: AlertKind, outcome: string): boolean {
  return (ALERT_OUTCOMES[kind] as readonly string[]).includes(outcome);
}

function toRow(
  r: AlertedRequest,
  alert: OpenAlert,
  stream: readonly RecordedAlertEvent[],
  viewerId: string,
  now: Date,
): AlertRow {
  const assigned = { id: r.assignedId, deactivatedAt: r.assignedDeactivatedAt };
  return {
    requestId: r.requestId,
    reference: r.reference,
    requesterName: `${r.name} ${r.surname}`,
    kind: alert.kind,
    raisedAt: alert.raisedAt.toISOString(),
    deferred: alert.deferred,
    rerunAttempts: alert.rerunAttempts,
    assignedTo: {
      displayName: r.assignedName,
      active: r.assignedDeactivatedAt === null,
    },
    outcomes: ALERT_OUTCOMES[alert.kind],
    clearable: !alert.deferred && mayClear(alert.kind, assigned, viewerId),
    silentHours:
      alert.kind === 'collection_lapse'
        ? silentHours(alert, stream, now)
        : null,
  };
}

/** The trip-wire's own hours at the raise, plus the wall clock since. */
function silentHours(
  alert: OpenAlert,
  stream: readonly RecordedAlertEvent[],
  now: Date,
): number {
  const raise = stream.findLast(
    (e) =>
      e.type === 'collection_lapse_raised' &&
      e.occurredAt.getTime() === alert.raisedAt.getTime(),
  );
  const atRaise =
    (raise?.payload as RequestEventPayloads['collection_lapse_raised'])
      ?.wallClockHoursElapsed ?? 24;
  return Math.floor(
    atRaise + (now.getTime() - alert.raisedAt.getTime()) / HOUR_MS,
  );
}
