import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { type RequestEventPayloads } from '../audit/event-catalogue';
import { DB, type Db } from '../db/database.module';
import { request, requestContact, requestEvent } from '../db/schema';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { schedulerHealth } from '../scheduler/scheduler-health';
import { CLOCK, type Clock } from '../clock/clock';
import { type Holidays } from '../clock/business-hours';
import { HOLIDAYS } from '../clock/thai-holidays';
import {
  type Area,
  type PendingRow,
  type Ranked,
  describeArea,
  rankPending,
} from './review-queue';

export interface QueueRow {
  id: string;
  reference: string;
  submittedAt: string;
  expiresAt: string;
  minutesLeft: number;
  expired: boolean;
  ahead: number | null;
  requesterName: string;
  diseaseGroupName: string;
}

export interface QueueList {
  /** When this list was read: the screen shows how stale it has become. */
  generatedAt: string;
  /**
   * `stopped` puts the banner on the queue (spec §15.3): the tick has missed
   * five passes, or an Extract has outlived its token by an hour. The Reviewer
   * is the guaranteed reader, so the screen says what that means for their
   * work; the operator reads the same fact on `/health`.
   */
  automaticProcessing: 'running' | 'stopped';
  requests: QueueRow[];
}

/** The summed count, or the Probe's still-pending or abandoned state (§5.4). */
export type ProbeRowCount = number | 'pending' | 'failed';

export interface Dossier extends QueueRow {
  contact: {
    name: string;
    surname: string;
    tel: string;
    email: string;
    workplace: string;
  };
  reportCodes: string[];
  /** Inclusive, as the Requester gave them. */
  startDate: string;
  endDate: string;
  area: Area;
  rowCount: ProbeRowCount;
}

// What a signed-in Reviewer reads. Read-only, and it selects only what the
// screen shows: no case row, no prior-Request history, no requester IP (§10.2).
@Injectable()
export class ReviewQueue {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(HOLIDAYS) private readonly holidays: Holidays,
    private readonly provinces: ProvinceLookup,
  ) {}

  // The list shows a name and a group, never the rest of the dossier (§10.2),
  // so it reads only those columns: the Reviewer's browsing view has no reason
  // to pull tel, email, workplace or the Request's parameters off disk.
  async list(): Promise<QueueList> {
    const now = this.clock.now();
    const rows = await this.db
      .select({
        id: request.id,
        reference: request.reference,
        submittedAt: request.submittedAt,
        diseaseGroupName: request.diseaseGroupName,
        name: requestContact.name,
        surname: requestContact.surname,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .where(eq(request.state, 'pending'));
    const scheduler = await schedulerHealth(this.db, now);
    return {
      generatedAt: now.toISOString(),
      automaticProcessing: scheduler.status === 'ok' ? 'running' : 'stopped',
      requests: rankPending(rows, now, this.holidays).map(toRow),
    };
  }

  /**
   * Null when there is no such pending Request. Queue position and expiry are
   * both properties of the whole pending set, so this still ranks every
   * pending Row — only the one Row's contact fields are ever read out of it.
   */
  async dossier(id: string): Promise<Dossier | null> {
    const now = this.clock.now();
    const rows = await this.db
      .select({
        id: request.id,
        reference: request.reference,
        submittedAt: request.submittedAt,
        diseaseGroupName: request.diseaseGroupName,
        reportCodes: request.reportCodes,
        startDate: request.startDate,
        endDate: request.endDate,
        provinces: request.provinces,
        name: requestContact.name,
        surname: requestContact.surname,
        tel: requestContact.tel,
        email: requestContact.email,
        workplace: requestContact.workplace,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .where(eq(request.state, 'pending'));
    const entry = rankPending(rows, now, this.holidays).find(
      (r) => r.id === id,
    );
    if (!entry) return null;
    return {
      ...toRow(entry),
      contact: {
        name: entry.name,
        surname: entry.surname,
        tel: entry.tel,
        email: entry.email,
        workplace: entry.workplace,
      },
      reportCodes: entry.reportCodes,
      startDate: entry.startDate,
      endDate: entry.endDate,
      area: describeArea(entry.provinces, this.provinces.provinces),
      rowCount: await this.probeRowCount(id),
    };
  }

  // `probe_performed`/`probe_failed` is terminal and written at most once per
  // Request (§5.4), so the first match settles it; no event yet reads pending.
  private async probeRowCount(id: string): Promise<ProbeRowCount> {
    const [row] = await this.db
      .select({ type: requestEvent.type, payload: requestEvent.payload })
      .from(requestEvent)
      .where(
        and(
          eq(requestEvent.requestId, id),
          inArray(requestEvent.type, ['probe_performed', 'probe_failed']),
        ),
      )
      .limit(1);
    if (!row) return 'pending';
    if (row.type === 'probe_failed') return 'failed';
    return (row.payload as RequestEventPayloads['probe_performed']).totalItems;
  }
}

function toRow(
  entry: Ranked<
    PendingRow & { diseaseGroupName: string; name: string; surname: string }
  >,
): QueueRow {
  return {
    id: entry.id,
    reference: entry.reference,
    submittedAt: entry.submittedAt.toISOString(),
    expiresAt: entry.expiresAt.toISOString(),
    minutesLeft: entry.minutesLeft,
    expired: entry.expired,
    ahead: entry.ahead,
    requesterName: `${entry.name} ${entry.surname}`,
    diseaseGroupName: entry.diseaseGroupName,
  };
}
