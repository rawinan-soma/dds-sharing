import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/database.module';
import { request, requestContact } from '../db/schema';
import { ProvinceLookup } from '../reference/province-lookup.service';
import {
  type ProbeRowCount,
  probeRowCountOf,
} from '../requests/probe-row-count';
import { schedulerHealth } from '../scheduler/scheduler-health';
import { CLOCK, type Clock } from '../clock/clock';
import { type AlertRow, Alerts } from './alerts.service';
import { InFlight, type InFlightListRow } from './in-flight.service';
import { ASK_COLUMNS, type Ask, askOf } from '../requests/ask';
import { type PendingRow, type Ranked, rankPending } from './review-queue';

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
  /** The must-clear items (§10.6), read in the same breath as the queue. */
  alerts: AlertRow[];
  /** Approved and not yet terminal (§10.9), read in the same breath too. */
  inFlight: InFlightListRow[];
}

export interface Dossier extends QueueRow, Ask {
  contact: {
    name: string;
    surname: string;
    tel: string;
    email: string;
    workplace: string;
  };
  reportCodes: string[];
  /** Inclusive, as the Requester gave them. */
  rowCount: ProbeRowCount;
}

// What a signed-in Reviewer reads. Read-only, and it selects only what the
// screen shows: no case row, no prior-Request history, no requester IP (§10.2).
@Injectable()
export class ReviewQueue {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly provinces: ProvinceLookup,
    private readonly alerts: Alerts,
    private readonly inFlight: InFlight,
  ) {}

  // The list shows a name and a group, never the rest of the dossier (§10.2),
  // so it reads only those columns: the Reviewer's browsing view has no reason
  // to pull tel, email, workplace or the Request's parameters off disk.
  async list(viewerId: string): Promise<QueueList> {
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
    const scheduler = await schedulerHealth(
      this.db,
      now,
      this.provinces.checksum,
    );
    return {
      generatedAt: now.toISOString(),
      automaticProcessing: scheduler.status === 'ok' ? 'running' : 'stopped',
      requests: rankPending(rows, now).map(toRow),
      alerts: await this.alerts.list(viewerId),
      inFlight: await this.inFlight.list(),
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
        ...ASK_COLUMNS,
        reportCodes: request.reportCodes,
        name: requestContact.name,
        surname: requestContact.surname,
        tel: requestContact.tel,
        email: requestContact.email,
        workplace: requestContact.workplace,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .where(eq(request.state, 'pending'));
    const entry = rankPending(rows, now).find((r) => r.id === id);
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
      ...askOf(entry, this.provinces.provinces),
      rowCount: await probeRowCountOf(this.db, id),
    };
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
