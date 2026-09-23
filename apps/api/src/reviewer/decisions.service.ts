import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { queueNotifiedAt } from '../audit/queue-notified-at';
import { writeRequestEvent } from '../audit/write-request-event';
import { DB, type Db } from '../db/database.module';
import { request, requestContact, requestEvent, reviewer } from '../db/schema';
import { insertQueuedJob } from '../extraction/extraction-jobs.repository';
import { ExtractionQueue } from '../extraction/extraction-queue';
import { MailSender } from '../mail/mail-sender';
import { requestExpiry, type Holidays } from './business-hours';
import { buildSnapshot, noteIsValid } from './decisions';
import { CLOCK, type Clock } from './clock';
import { HOLIDAYS } from './review-queue.service';

export interface DecidingReviewer {
  reviewerId: string;
  displayName: string;
}

export type DecisionOutcome =
  | { status: 'recorded'; decision: 'approved' | 'rejected'; decidedAt: string }
  | { status: 'expired' }
  | { status: 'not_pending' }
  | { status: 'invalid_note' };

export type AmendOutcome =
  { status: 'amended' } | { status: 'not_found' } | { status: 'invalid_note' };

// The Decision (spec §10.3, §10.4): approve or reject, nothing else, and never
// past the 24-business-hour threshold — re-derived here, immediately before the
// insert, because a stored `expired` would only be true "unless a tick was
// slow" (§10.4).
@Injectable()
export class Decisions {
  private readonly logger = new Logger(Decisions.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(HOLIDAYS) private readonly holidays: Holidays,
    private readonly extractionQueue: ExtractionQueue,
    private readonly mailSender: MailSender,
  ) {}

  async approve(id: string, by: DecidingReviewer): Promise<DecisionOutcome> {
    return this.decide(id, 'approved', by, {});
  }

  async reject(
    id: string,
    by: DecidingReviewer,
    internalNote: string,
  ): Promise<DecisionOutcome> {
    if (!noteIsValid(internalNote)) return { status: 'invalid_note' };
    return this.decide(id, 'rejected', by, { internalNote });
  }

  // Approve and reject share everything except which event they write: the
  // pending row is locked, expiry is re-derived against it, and only then does
  // either outcome apply — all inside one transaction, so a Decision and its
  // event are never in different states of landing (§12.2).
  private async decide(
    id: string,
    decision: 'approved' | 'rejected',
    by: DecidingReviewer,
    extra: { internalNote?: string },
  ): Promise<DecisionOutcome> {
    const now = this.clock.now();
    let queuedJobId: string | undefined;
    let rejectionMail:
      | { requestId: string; to: string; name: string; reference: string }
      | undefined;
    const outcome = await this.db.transaction(
      async (tx): Promise<DecisionOutcome> => {
        const [row] = await tx
          .select({
            reference: request.reference,
            submittedAt: request.submittedAt,
            diseaseGroupName: request.diseaseGroupName,
            reportCodes: request.reportCodes,
            startDate: request.startDate,
            endDate: request.endDate,
            provinces: request.provinces,
            workplace: requestContact.workplace,
            contactName: requestContact.name,
            contactSurname: requestContact.surname,
            contactEmail: requestContact.email,
          })
          .from(request)
          .innerJoin(requestContact, eq(requestContact.requestId, request.id))
          // Pending only: an already-decided Request must short-circuit to
          // `not_pending` regardless of its age, or a stale hit on one settled
          // days ago would fall through to the expiry branch below and write a
          // false `expired` event onto a Request nothing is wrong with (§10.4).
          .where(sql`${request.id} = ${id} AND ${request.state} = 'pending'`)
          // Locked on `request` alone: the application role holds no UPDATE at
          // all on `request_contact` (spec §12.2, ADR 0019), and `FOR UPDATE`
          // over a join would otherwise demand it just to take the lock.
          .for('update', { of: request });
        if (!row) return { status: 'not_pending' };

        const expiry = requestExpiry(row.submittedAt, now, this.holidays);
        if (expiry.expired) {
          const [{ activeReviewers }] = await tx
            .select({ activeReviewers: sql<number>`count(*)::int` })
            .from(reviewer)
            .where(sql`${reviewer.deactivatedAt} IS NULL`);
          await writeRequestEvent(tx, {
            requestId: id,
            type: 'expired',
            occurredAt: now,
            actor: { actorType: 'system' },
            payload: {
              notifiedAt: await queueNotifiedAt(tx, id),
              businessHoursElapsed: expiry.hoursElapsed,
              reviewerAccountsActive: activeReviewers,
              decisionAttemptedAndRefused: true,
            },
          });
          return { status: 'expired' };
        }

        const updated = await tx
          .update(request)
          .set({ state: decision })
          .where(sql`${request.id} = ${id} AND ${request.state} = 'pending'`)
          .returning({ id: request.id });
        if (updated.length === 0) return { status: 'not_pending' };

        const snapshot = buildSnapshot(row);
        const actor = {
          actorType: 'reviewer' as const,
          reviewerId: by.reviewerId,
        };
        if (decision === 'approved') {
          await writeRequestEvent(tx, {
            requestId: id,
            type: 'approved',
            occurredAt: now,
            actor,
            payload: { snapshot },
          });
          // A job row is written to Postgres at approval, in the same
          // transaction as `approved` itself (spec §7.7) — there is never an
          // approved Request with no job row, or a job row for one that isn't.
          // The BullMQ job carrying only the reference is enqueued after
          // commit, below.
          queuedJobId = await insertQueuedJob(tx, id);
          await writeRequestEvent(tx, {
            requestId: id,
            type: 'job_queued',
            occurredAt: now,
            actor: { actorType: 'system' },
            payload: {},
          });
        } else {
          await writeRequestEvent(tx, {
            requestId: id,
            type: 'rejected',
            occurredAt: now,
            actor,
            payload: { snapshot, internalNote: extra.internalNote! },
          });
          rejectionMail = {
            requestId: id,
            to: row.contactEmail,
            name: `${row.contactName} ${row.contactSurname}`,
            reference: row.reference,
          };
        }

        return { status: 'recorded', decision, decidedAt: now.toISOString() };
      },
    );

    // Fired after commit, so a lost enqueue never leaves a job row Postgres
    // does not yet know about; a lost enqueue itself is recovered by the
    // tick's reconcile (spec §7.7, §15.3), not by anything here.
    if (queuedJobId) {
      const jobId = queuedJobId;
      // A lost enqueue is recovered by the tick's reconcile (spec §7.7,
      // §15.3); it must never crash the process that just approved a Request.
      this.extractionQueue.enqueue(jobId, id).catch((error: unknown) => {
        this.logger.error(
          `Failed to enqueue extraction job ${jobId}: ${(error as Error).message}`,
        );
      });
    }

    // Also fired after commit, and never awaited, matching the enqueue above —
    // a rejected Request is already recorded regardless of whether the email
    // sends (spec §11.3's retry-then-Alert path covers a failed send).
    if (rejectionMail) {
      const mail = rejectionMail;
      this.mailSender
        .send(mail.requestId, mail.to, {
          kind: 'rejection',
          name: mail.name,
          reference: mail.reference,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to send rejection mail for request ${mail.requestId}: ${(error as Error).message}`,
          );
        });
    }

    return outcome;
  }

  /**
   * A mistyped internal note is corrected by a new event citing the one it
   * corrects, never by an edit (§12.2). `eventId` must name a `rejected` event;
   * anything else corrects nothing.
   */
  async amendNote(
    eventId: number,
    by: DecidingReviewer,
    internalNote: string,
  ): Promise<AmendOutcome> {
    if (!noteIsValid(internalNote)) return { status: 'invalid_note' };
    return this.db.transaction(async (tx) => {
      const [original] = await tx
        .select({ id: requestEvent.id, requestId: requestEvent.requestId })
        .from(requestEvent)
        .where(
          sql`${requestEvent.id} = ${eventId} AND ${requestEvent.type} = 'rejected'`,
        );
      if (!original) return { status: 'not_found' };

      await writeRequestEvent(tx, {
        requestId: original.requestId,
        type: 'note_amended',
        occurredAt: this.clock.now(),
        actor: { actorType: 'reviewer', reviewerId: by.reviewerId },
        payload: { amendsEventId: original.id, internalNote },
      });
      return { status: 'amended' };
    });
  }
}
