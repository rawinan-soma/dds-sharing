import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  type ActorType,
  type RequestEventPayloads,
  type RequestEventType,
} from '../audit/event-catalogue';
import { CLOCK, type Clock } from '../clock/clock';
import { DB, type Db } from '../db/database.module';
import { downloadToken, request, requestEvent, reviewer } from '../db/schema';
import { runNumberOf } from '../extraction/archive-naming';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { settledState } from '../requests/in-flight';
import { currentToken } from '../requests/in-flight-records';
import { type RequestState } from '../requests/request-state';
import { type SurfaceZone, surfaceZone } from '../requests/surface-zone';
import { openAlertsOf } from './alert-records';
import { type LinkState, linkState } from './lookup';
import { type Area, describeArea } from './review-queue';
import { type ProbeRowCount } from './review-queue.service';

/**
 * What a lookup finds. A Request still on the surface is only pointed at: it
 * opens in its zone, where that zone's own read decides what it shows. A
 * terminal one is read out here, as a record.
 */
export type LookupResult =
  | { zone: SurfaceZone; requestId: string }
  | { zone: null; record: RequestRecord };

/**
 * A terminal Request, read-only (§10.10). The record, never the contact
 * fields (ADR 0015): the only `workplace` here is the Snapshot's.
 */
export interface RequestRecord {
  requestId: string;
  reference: string;
  state: RequestState;
  submittedAt: string;
  diseaseGroupName: string;
  reportCodes: string[];
  startDate: string;
  endDate: string;
  area: Area;
  /** Null for a Request that expired with no Decision. */
  decision: {
    outcome: 'approved' | 'rejected';
    reviewer: string;
    decidedAt: string;
    workplace: string;
    /** The count as the Snapshot holds it: what the Reviewer had on screen. */
    rowCount: ProbeRowCount;
  } | null;
  /** Every Extract archive, newest run first. Never a token. */
  files: {
    run: number;
    archiveFilename: string;
    link: LinkState;
    expiresAt: string;
    /** Archive presentations — Attempts, as the cap counts them (§9.2). */
    attempts: number;
  }[];
  /**
   * The trail, newest first: what happened, when, and who did it. Never a
   * payload — a `mail_sent` carries the address it went to, a `submitted`
   * the Requester's IP, and a rejection its internal note.
   */
  events: {
    type: RequestEventType;
    occurredAt: string;
    actor: ActorType;
    /** The Reviewer's name, for a `reviewer` actor only. */
    reviewer: string | null;
  }[];
}

// Looking up a Request by its exact reference (spec §10.10). A read, and so
// never an event: nothing here writes anything.
@Injectable()
export class RequestLookup {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly provinces: ProvinceLookup,
  ) {}

  /** Null when no Request has exactly this reference. */
  async find(reference: string): Promise<LookupResult | null> {
    const now = this.clock.now();
    // Only what the record shows: the contact table is not joined at all.
    const [r] = await this.db
      .select({
        requestId: request.id,
        reference: request.reference,
        state: request.state,
        submittedAt: request.submittedAt,
        diseaseGroupName: request.diseaseGroupName,
        reportCodes: request.reportCodes,
        startDate: request.startDate,
        endDate: request.endDate,
        provinces: request.provinces,
      })
      .from(request)
      .where(eq(request.reference, reference));
    if (!r) return null;

    // The zone as it already is, whether or not the tick has recorded it: a
    // lapsed, never-collected link has ended the Request (ADR 0016).
    const state = settledState(
      r.state,
      await currentToken(this.db, r.requestId),
      now,
    );
    const hasOpenAlert = (await openAlertsOf(this.db, r.requestId)).length > 0;
    const zone = surfaceZone(state, hasOpenAlert);
    if (zone) return { zone, requestId: r.requestId };

    return {
      zone: null,
      record: {
        requestId: r.requestId,
        reference: r.reference,
        state,
        submittedAt: r.submittedAt.toISOString(),
        diseaseGroupName: r.diseaseGroupName,
        reportCodes: r.reportCodes,
        startDate: r.startDate,
        endDate: r.endDate,
        area: describeArea(r.provinces, this.provinces.provinces),
        decision: await this.decisionOf(r.requestId),
        files: await this.filesOf(r.requestId, now),
        events: await this.eventsOf(r.requestId),
      },
    };
  }

  private async decisionOf(
    requestId: string,
  ): Promise<RequestRecord['decision']> {
    const [decision] = await this.db
      .select({
        type: requestEvent.type,
        reviewer: reviewer.displayName,
        occurredAt: requestEvent.occurredAt,
        payload: requestEvent.payload,
      })
      .from(requestEvent)
      .innerJoin(reviewer, eq(reviewer.id, requestEvent.reviewerId))
      .where(
        and(
          eq(requestEvent.requestId, requestId),
          inArray(requestEvent.type, ['approved', 'rejected']),
        ),
      )
      .limit(1);
    if (!decision) return null;
    const { snapshot } = decision.payload as RequestEventPayloads[
      'approved' | 'rejected'];
    return {
      outcome: decision.type as 'approved' | 'rejected',
      reviewer: decision.reviewer,
      decidedAt: decision.occurredAt.toISOString(),
      workplace: snapshot.workplace,
      rowCount: snapshot.probeRowCount,
    };
  }

  private async filesOf(
    requestId: string,
    now: Date,
  ): Promise<RequestRecord['files']> {
    const tokens = await this.db
      .select({
        archiveFilename: downloadToken.archiveFilename,
        expiresAt: downloadToken.expiresAt,
        revokedAt: downloadToken.revokedAt,
        // Qualified by hand, as in `currentToken`: drizzle drops the table
        // from a column inside a subquery.
        attempts: sql<number>`(
          SELECT count(*)::int FROM token_lookup l
          WHERE l.download_token_id = download_token.id
            AND l.kind = 'archive' AND l.outcome = 'success')`,
      })
      .from(downloadToken)
      .where(eq(downloadToken.requestId, requestId))
      .orderBy(desc(downloadToken.createdAt));
    return tokens.map((t) => ({
      run: runNumberOf(t.archiveFilename),
      archiveFilename: t.archiveFilename,
      link: linkState(t, now),
      expiresAt: t.expiresAt.toISOString(),
      attempts: t.attempts,
    }));
  }

  private async eventsOf(requestId: string): Promise<RequestRecord['events']> {
    const events = await this.db
      .select({
        type: requestEvent.type,
        occurredAt: requestEvent.occurredAt,
        actor: requestEvent.actorType,
        reviewer: reviewer.displayName,
      })
      .from(requestEvent)
      .leftJoin(reviewer, eq(reviewer.id, requestEvent.reviewerId))
      .where(eq(requestEvent.requestId, requestId))
      // The sequence answers "in what order"; the timestamps only "when".
      .orderBy(desc(requestEvent.id));
    return events.map((e) => ({
      ...e,
      occurredAt: e.occurredAt.toISOString(),
    }));
  }
}
