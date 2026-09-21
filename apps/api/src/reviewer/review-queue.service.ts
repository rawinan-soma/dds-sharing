import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/database.module';
import { request, requestContact } from '../db/schema';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { CLOCK, type Clock } from './clock';
import { type Holidays } from './business-hours';
import {
  type Area,
  type PendingRow,
  type Ranked,
  describeArea,
  rankPending,
} from './review-queue';

export const HOLIDAYS = Symbol('HOLIDAYS');

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
  requests: QueueRow[];
}

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
  /** No Probe yet (a later slice): null is the honest value, not zero. */
  rowCount: null;
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

  async list(): Promise<QueueList> {
    const now = this.clock.now();
    const ranked = await this.ranked(now);
    return {
      generatedAt: now.toISOString(),
      requests: ranked.map((entry) => toRow(entry)),
    };
  }

  /** Null when there is no such pending Request. */
  async dossier(id: string): Promise<Dossier | null> {
    const entry = (await this.ranked(this.clock.now())).find(
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
      rowCount: null,
    };
  }

  private async ranked(now: Date) {
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
    return rankPending(rows, now, this.holidays);
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
