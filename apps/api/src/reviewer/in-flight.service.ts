import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { writeRequestEvent, type Executor } from '../audit/write-request-event';
import { CLOCK, type Clock } from '../clock/clock';
import { DB, type Db } from '../db/database.module';
import {
  downloadToken,
  extractionJob,
  mailDelivery,
  request,
  requestContact,
  requestEvent,
  reviewer,
  tokenLookup,
} from '../db/schema';
import { insertQueuedJob } from '../extraction/extraction-jobs.repository';
import { ExtractionQueue } from '../extraction/extraction-queue';
import { MailDeliveries } from '../mail/mail-delivery.repository';
import { MailQueue } from '../mail/mail-queue';
import { ProvinceLookup } from '../reference/province-lookup.service';
import {
  type ExtractionState,
  type InFlightActions,
  type InFlightFacts,
  inFlightRow,
  settledState,
} from '../requests/in-flight';
import { surfaceZone } from '../requests/surface-zone';
import { alertEventsOf } from './alert-records';
import { openAlerts } from './alerts';
import { type Area, describeArea } from './review-queue';

/** One row of the in-flight list: what it reads, never who approved it. */
export interface InFlightListRow {
  requestId: string;
  reference: string;
  submittedAt: string;
  requesterName: string;
  diseaseGroupName: string;
  extraction: ExtractionState;
  /** Wall-clock: a timestamp the system will act on, not a prediction. */
  linkExpiresAt: string | null;
  actions: InFlightActions;
}

export interface InFlightDetail extends InFlightListRow {
  /** Live, from the Request, never the Snapshot (ADR 0015). */
  contact: {
    name: string;
    surname: string;
    tel: string;
    email: string;
    workplace: string;
  };
  reportCodes: string[];
  startDate: string;
  endDate: string;
  area: Area;
  /** The decision line: accountability, not permission. */
  approvedBy: string;
  approvedAt: string;
  /** The current Extract's file, never its token. Null until one is ready. */
  file: {
    archiveFilename: string;
    linkExpiresAt: string;
    /** Archive presentations — Attempts, as the cap counts them (§9.2). */
    attempts: number;
  } | null;
}

export type ReRunOutcome =
  | { status: 'queued'; queuedAt: string }
  /** Not in flight — never approved, or terminal (ADR 0016). */
  | { status: 'not_in_flight' }
  /** A job is queued or running: a second would duplicate it. */
  | { status: 'not_possible' };

export type ResendOutcome =
  | { status: 'sent'; sentAt: string }
  | { status: 'not_in_flight' }
  /** Nothing ready to resend: extracting, failed, or its Delivery not sent yet. */
  | { status: 'not_possible' }
  /** The sent Delivery is no longer held — Redis lost it — so it cannot be rebuilt. */
  | { status: 'unavailable' };

/** How far back a resend looks for the current link's Delivery. */
const DELIVERIES_SEARCHED = 5;

// Re-run and resend (spec §10.7, §10.8): the two things a Reviewer can do to
// a Request already approved. Neither is a new Decision — neither can change
// anything a Decision was about.
@Injectable()
export class InFlight {
  private readonly logger = new Logger(InFlight.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly extractionQueue: ExtractionQueue,
    private readonly mailQueue: MailQueue,
    private readonly mailDeliveries: MailDeliveries,
    private readonly provinces: ProvinceLookup,
  ) {}

  /**
   * Approved and not yet terminal, oldest submission first and by nothing
   * more urgent: the Alert section is the only part of the surface allowed
   * to shout. A Request with an open Alert is there instead, never here too.
   */
  async list(): Promise<InFlightListRow[]> {
    const now = this.clock.now();
    const approved = await this.db
      .select({
        requestId: request.id,
        reference: request.reference,
        submittedAt: request.submittedAt,
        diseaseGroupName: request.diseaseGroupName,
        name: requestContact.name,
        surname: requestContact.surname,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .where(eq(request.state, 'approved'))
      .orderBy(asc(request.submittedAt), asc(request.reference));
    const alerted = await this.withOpenAlerts(approved.map((r) => r.requestId));

    const rows: InFlightListRow[] = [];
    for (const r of approved) {
      const facts = await factsOf(this.db, r.requestId, 'approved');
      const state = settledState(facts.state, facts.token, now);
      if (surfaceZone(state, alerted.has(r.requestId)) !== 'in_flight') {
        continue;
      }
      const row = inFlightRow(facts, now);
      if (!row) continue;
      rows.push({
        requestId: r.requestId,
        reference: r.reference,
        submittedAt: r.submittedAt.toISOString(),
        requesterName: `${r.name} ${r.surname}`,
        diseaseGroupName: r.diseaseGroupName,
        extraction: row.extraction,
        linkExpiresAt: row.linkExpiresAt?.toISOString() ?? null,
        actions: row.actions,
      });
    }
    return rows;
  }

  /** Null unless the Request is on the in-flight list right now. */
  async detail(requestId: string): Promise<InFlightDetail | null> {
    const now = this.clock.now();
    const [r] = await this.db
      .select({
        state: request.state,
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
      .where(eq(request.id, requestId));
    if (!r) return null;
    const facts = await factsOf(this.db, requestId, r.state);
    const state = settledState(facts.state, facts.token, now);
    const alerted = await this.withOpenAlerts([requestId]);
    if (surfaceZone(state, alerted.has(requestId)) !== 'in_flight') return null;
    const row = inFlightRow(facts, now);
    if (!row) return null;

    const [decision] = await this.db
      .select({
        approvedBy: reviewer.displayName,
        approvedAt: requestEvent.occurredAt,
      })
      .from(requestEvent)
      .innerJoin(reviewer, eq(reviewer.id, sql`${requestEvent.reviewerId}`))
      .where(
        and(
          eq(requestEvent.requestId, requestId),
          eq(requestEvent.type, 'approved'),
        ),
      )
      .limit(1);
    if (!decision) return null;
    const file = facts.token
      ? await this.fileOf(facts.token.id, facts.token.attempts)
      : null;

    return {
      requestId,
      reference: r.reference,
      submittedAt: r.submittedAt.toISOString(),
      requesterName: `${r.name} ${r.surname}`,
      diseaseGroupName: r.diseaseGroupName,
      extraction: row.extraction,
      linkExpiresAt: row.linkExpiresAt?.toISOString() ?? null,
      actions: row.actions,
      contact: {
        name: r.name,
        surname: r.surname,
        tel: r.tel,
        email: r.email,
        workplace: r.workplace,
      },
      reportCodes: r.reportCodes,
      startDate: r.startDate,
      endDate: r.endDate,
      area: describeArea(r.provinces, this.provinces.provinces),
      approvedBy: decision.approvedBy,
      approvedAt: decision.approvedAt.toISOString(),
      file,
    };
  }

  /**
   * A second extraction of an approved Request, started by a Reviewer. It
   * writes no Decision: `extraction_rerun_queued` carries the original one's
   * id, so the record reads approved once, extracted twice. It does not
   * re-Probe, and it revokes nothing — the job does that at ready (ADR 0012).
   * Pressing it defers an open extraction-failure Alert (ADR 0014): that is
   * read off this event, so nothing more is written here.
   */
  async rerun(requestId: string, reviewerId: string): Promise<ReRunOutcome> {
    const now = this.clock.now();
    let jobId: string | undefined;
    const outcome = await this.db.transaction(
      async (tx): Promise<ReRunOutcome> => {
        // Locked first, so two Reviewers pressing at once queue one job.
        const [row] = await tx
          .select({ state: request.state })
          .from(request)
          .where(eq(request.id, requestId))
          .for('update');
        if (!row) return { status: 'not_in_flight' };
        const facts = await factsOf(tx, requestId, row.state);
        const inFlight = inFlightRow(facts, now);
        if (!inFlight) return { status: 'not_in_flight' };
        if (!inFlight.actions.rerun) return { status: 'not_possible' };

        const [decision] = await tx
          .select({ id: requestEvent.id })
          .from(requestEvent)
          .where(
            and(
              eq(requestEvent.requestId, requestId),
              eq(requestEvent.type, 'approved'),
            ),
          )
          .limit(1);
        if (!decision) return { status: 'not_in_flight' };

        jobId = await insertQueuedJob(tx, requestId);
        await writeRequestEvent(tx, {
          requestId,
          type: 'extraction_rerun_queued',
          occurredAt: now,
          actor: { actorType: 'reviewer', reviewerId },
          payload: { originalDecisionEventId: decision.id },
        });
        await writeRequestEvent(tx, {
          requestId,
          type: 'job_queued',
          occurredAt: now,
          actor: { actorType: 'system' },
          payload: {},
        });
        return { status: 'queued', queuedAt: now.toISOString() };
      },
    );

    // After commit, as at approval: a lost enqueue is the tick's reconcile's
    // to recover (§7.7), never a reason to fail the press.
    if (jobId) {
      const queued = jobId;
      this.extractionQueue
        .enqueue(queued, requestId)
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to enqueue re-run job ${queued}: ${(error as Error).message}`,
          );
        });
    }
    return outcome;
  }

  /**
   * The same Delivery, to the same address, again (§10.8). It is the sent
   * message itself that goes — the only place the raw Download token exists —
   * so the link, the address and the 72 hours are all exactly what they were;
   * nothing here can name another address (ADR 0017). The second `mail_sent`
   * is the audit. It takes the current link's Delivery, never a superseded
   * one's.
   */
  async resend(requestId: string): Promise<ResendOutcome> {
    const now = this.clock.now();
    const [row] = await this.db
      .select({ state: request.state })
      .from(request)
      .where(eq(request.id, requestId));
    if (!row) return { status: 'not_in_flight' };
    const facts = await factsOf(this.db, requestId, row.state);
    const inFlight = inFlightRow(facts, now);
    if (!inFlight) return { status: 'not_in_flight' };
    if (!inFlight.actions.resend || !facts.token) {
      return { status: 'not_possible' };
    }
    const tokenId = facts.token.id;

    const sentDeliveries = await this.db
      .select({ id: mailDelivery.id })
      .from(mailDelivery)
      .where(
        and(
          eq(mailDelivery.requestId, requestId),
          eq(mailDelivery.kind, 'delivery'),
          eq(mailDelivery.status, 'sent'),
        ),
      )
      .orderBy(desc(mailDelivery.createdAt))
      .limit(DELIVERIES_SEARCHED);
    if (sentDeliveries.length === 0) return { status: 'not_possible' };
    for (const { id } of sentDeliveries) {
      const message = await this.mailQueue.sentMessage(id);
      if (message?.downloadTokenId !== tokenId) continue;
      const mailDeliveryId = await this.mailDeliveries.create(
        requestId,
        'delivery',
      );
      await this.mailQueue.enqueue({ ...message, mailDeliveryId });
      return { status: 'sent', sentAt: now.toISOString() };
    }
    return { status: 'unavailable' };
  }

  private async withOpenAlerts(
    requestIds: readonly string[],
  ): Promise<Set<string>> {
    const byRequest = new Map<
      string,
      Awaited<ReturnType<typeof alertEventsOf>>
    >();
    for (const event of await alertEventsOf(this.db, requestIds)) {
      byRequest.set(event.requestId, [
        ...(byRequest.get(event.requestId) ?? []),
        event,
      ]);
    }
    return new Set(
      [...byRequest]
        .filter(([, stream]) => openAlerts(stream).length > 0)
        .map(([id]) => id),
    );
  }

  private async fileOf(
    tokenId: string,
    attempts: number,
  ): Promise<InFlightDetail['file']> {
    const [token] = await this.db
      .select({
        archiveFilename: downloadToken.archiveFilename,
        expiresAt: downloadToken.expiresAt,
      })
      .from(downloadToken)
      .where(eq(downloadToken.id, tokenId));
    return {
      archiveFilename: token.archiveFilename,
      linkExpiresAt: token.expiresAt.toISOString(),
      attempts,
    };
  }
}

/** What `inFlightRow` needs to know about one Request, read now. */
export async function factsOf(
  db: Executor,
  requestId: string,
  state: InFlightFacts['state'],
): Promise<InFlightFacts & { token: CurrentToken | null }> {
  const [job] = await db
    .select({ status: extractionJob.status })
    .from(extractionJob)
    .where(eq(extractionJob.requestId, requestId))
    .orderBy(desc(extractionJob.createdAt))
    .limit(1);
  return {
    state,
    job: job?.status ?? null,
    token: await currentToken(db, requestId),
  };
}

type CurrentToken = NonNullable<InFlightFacts['token']> & { id: string };

/** The newest Download token no Re-run revoked, and its Attempts so far. */
export async function currentToken(
  db: Executor,
  requestId: string,
): Promise<CurrentToken | null> {
  const [token] = await db
    .select({ id: downloadToken.id, expiresAt: downloadToken.expiresAt })
    .from(downloadToken)
    .where(
      and(
        eq(downloadToken.requestId, requestId),
        isNull(downloadToken.revokedAt),
      ),
    )
    .orderBy(desc(downloadToken.createdAt))
    .limit(1);
  if (!token) return null;
  const attempts = await db
    .select({ id: tokenLookup.id })
    .from(tokenLookup)
    .where(
      and(
        eq(tokenLookup.downloadTokenId, token.id),
        eq(tokenLookup.kind, 'archive'),
        eq(tokenLookup.outcome, 'success'),
      ),
    );
  return { ...token, attempts: attempts.length };
}
