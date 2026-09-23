import { Logger, type LoggerService } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { type Pool } from 'pg';
import { writeRequestEvent } from '../audit/write-request-event';
import { type Db } from '../db/database.module';
import {
  downloadToken,
  request,
  requestEvent,
  reviewer,
  schedulerHeartbeat,
} from '../db/schema';
import { type ArchiveStore } from '../extraction/archive-store';
import { EXTRACTION_DEFAULTS } from '../extraction/extraction.config';
import { type ExtractionJobs } from '../extraction/extraction-jobs.repository';
import { type ExtractionQueue } from '../extraction/extraction-queue';
import { type MailDeliveries } from '../mail/mail-delivery.repository';
import {
  MAIL_MAX_ATTEMPTS,
  MAIL_RETRY_DELAY_MS,
  type MailQueue,
} from '../mail/mail-queue';
import { type Holidays, requestExpiry } from '../reviewer/business-hours';
import { type Clock } from '../reviewer/clock';
import { type LoginThrottle } from '../reviewer/login-throttle';
import { type ReviewerSessions } from '../reviewer/reviewer-sessions';
import { collectionLapse } from './collection-lapse';
import {
  type ObjectDeletedOutcome,
  objectsStillHeld,
} from './scheduler-health';

/** Every pass takes this one lock (spec §15.3). Distinct from the app's other advisory keys. */
export const TICK_LOCK_KEY = 7_215_003;

/**
 * `startup` is the same pass with no lower bound on "due", and it touches
 * exactly two things: unfinished extractions and expired-token objects. It
 * never touches `pending` — an unapproved Request has no work, and its clock
 * is derived (§15.3).
 */
export type TickMode = 'regular' | 'startup';

export interface PassReport {
  extractionsReenqueued: number;
  objectsDeleted: number;
  requestsExpired: number;
  mailRetried: number;
  mailAbandoned: number;
  lapsesRaised: number;
  requestsEnded: number;
  sessionsPruned: number;
  throttleRowsPruned: number;
}

export interface TickDeps {
  db: Db;
  /** The lock is held on one connection of its own for the whole pass. */
  pool: Pool;
  clock: Clock;
  holidays: Holidays;
  archiveStore: ArchiveStore;
  extractionJobs: ExtractionJobs;
  extractionQueue: ExtractionQueue;
  mailQueue: MailQueue;
  mailDeliveries: MailDeliveries;
  sessions: ReviewerSessions;
  loginThrottle: LoginThrottle;
  logger?: LoggerService;
}

interface LiveToken {
  requestId: string;
  expiresAt: Date;
  /** Successful archive presentations: Attempts, as the cap counts them (§9.2). */
  attempts: number;
  /** The Delivery's `mail_sent`, if the relay has accepted it yet. */
  deliveredAt: Date | null;
  lapseRaised: boolean;
}

/**
 * The 60-second pass (spec §15.3): finds due work in Postgres and does it.
 * Redis executes; Postgres is the truth. Stateless — "due" is a query, not an
 * event, so a restart needs no catch-up: the next pass picks up everything
 * outstanding, and there is no missed-window class of bug.
 *
 * Expiry itself is derived at read time (§15.1) and never waits on this: a
 * dead tick cannot un-expire a Request or keep an Extract reachable. What the
 * pass adds is the record of a fact already true — a late pass writes a late
 * row, never a wrong outcome — plus the two jobs that genuinely need a timer:
 * deleting objects nobody asks for, and noticing jobs nobody is running.
 */
export class Tick {
  private readonly logger: LoggerService;
  private failedSteps = 0;

  constructor(private readonly deps: TickDeps) {
    this.logger = deps.logger ?? new Logger('Tick');
  }

  /** `skipped` when another process holds the lock: it is running this pass. */
  async runPass(mode: TickMode = 'regular'): Promise<PassReport | 'skipped'> {
    const client = await this.deps.pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [TICK_LOCK_KEY],
      );
      if (!rows[0].locked) return 'skipped';
      try {
        return await this.pass(mode);
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [TICK_LOCK_KEY]);
      }
    } finally {
      client.release();
    }
  }

  private async pass(mode: TickMode): Promise<PassReport> {
    const now = this.deps.clock.now();
    this.failedSteps = 0;
    const startup = mode === 'startup';
    const report: PassReport = {
      extractionsReenqueued: await this.step('extractions', 0, () =>
        this.reconcileExtractions(startup ? null : now),
      ),
      objectsDeleted: await this.step('objects', 0, () =>
        this.deleteExpiredObjects(now),
      ),
      requestsExpired: 0,
      mailRetried: 0,
      mailAbandoned: 0,
      lapsesRaised: 0,
      requestsEnded: 0,
      sessionsPruned: 0,
      throttleRowsPruned: 0,
    };
    if (!startup) {
      report.requestsExpired = await this.step('expiry', 0, () =>
        this.materialiseExpired(now),
      );
      const mail = await this.step('mail', { retried: 0, abandoned: 0 }, () =>
        this.retryDueMail(now),
      );
      report.mailRetried = mail.retried;
      report.mailAbandoned = mail.abandoned;
      report.lapsesRaised = await this.step('lapses', 0, () =>
        this.raiseCollectionLapses(now),
      );
      report.requestsEnded = await this.step('collection', 0, () =>
        this.endExpiredDeliveries(now),
      );
      report.sessionsPruned = await this.step('sessions', 0, () =>
        this.deps.sessions.pruneDead(now),
      );
      report.throttleRowsPruned = await this.step('throttle', 0, () =>
        this.deps.loginThrottle.pruneDecayed(now),
      );
    }
    // The heartbeat means the whole pass did its work. A pass with a failed
    // job does not beat: four ways to be half-alive is what one pass exists
    // to rule out (§15.3), and five such passes put the banner up.
    if (this.failedSteps === 0) await this.beat(now);
    return report;
  }

  // One job failing must not stop the others: a broken MinIO is no reason to
  // stop expiring Requests. The failure is loud in the log, and withholds the
  // heartbeat, so it is loud on the banner and /health too.
  private async step<T>(
    name: string,
    nothingDone: T,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.error(
        `tick step ${name} failed: ${(error as Error).message}`,
      );
      this.failedSteps += 1;
      return nothingDone;
    }
  }

  private async beat(now: Date): Promise<void> {
    await this.deps.db
      .insert(schedulerHeartbeat)
      .values({ id: 1, beatAt: now })
      .onConflictDoUpdate({
        target: schedulerHeartbeat.id,
        set: { beatAt: now },
      });
  }

  /**
   * Stall detection and the reconcile, one query (§7.7, §15.3): a job with no
   * progress for the stall window that BullMQ no longer holds is re-enqueued
   * — code-atomic retry makes running it again from scratch safe. A live one
   * is left to its own in-process stall guard. `null` is the startup bound:
   * every unfinished job is due.
   */
  private async reconcileExtractions(now: Date | null): Promise<number> {
    const quietSince = now
      ? new Date(now.getTime() - EXTRACTION_DEFAULTS.stallMs)
      : null;
    let reenqueued = 0;
    for (const job of await this.deps.extractionJobs.unfinished(quietSince)) {
      if (
        await this.deps.extractionQueue.reenqueueIfNotLive(
          job.id,
          job.requestId,
        )
      ) {
        reenqueued += 1;
      }
    }
    if (reenqueued > 0) {
      this.logger.log(`re-enqueued ${reenqueued} extraction job(s)`);
    }
    return reenqueued;
  }

  /**
   * Object deletion at token expiry (§9.5), by the application, on the
   * record. A token a Re-run superseded has its object deleted on the next
   * pass rather than at its own expiry (ADR 0012). An object already gone —
   * the lifecycle backstop got there first — is recorded as such, never
   * skipped. A failed delete writes no record and is tried again next pass;
   * it fails the step, so the heartbeat is withheld, and an hour of it also
   * trips the overdue-object signal.
   */
  private async deleteExpiredObjects(now: Date): Promise<number> {
    const { db, archiveStore } = this.deps;
    const due = await db
      .select({
        requestId: downloadToken.requestId,
        objectKey: downloadToken.archiveFilename,
      })
      .from(downloadToken)
      .where(objectsStillHeld(db, now));
    let deleted = 0;
    let failed = 0;
    for (const { requestId, objectKey } of due) {
      try {
        const present = (await archiveStore.stat(objectKey)) !== null;
        if (present) await archiveStore.remove(objectKey);
        const outcome: ObjectDeletedOutcome = present
          ? 'deleted'
          : 'already_absent';
        await writeRequestEvent(db, {
          requestId,
          type: 'object_deleted',
          occurredAt: now,
          actor: { actorType: 'system' },
          payload: { objectKey, outcome },
        });
        deleted += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `could not delete object ${objectKey}: ${(error as Error).message}`,
        );
      }
    }
    if (failed > 0) throw new Error(`${failed} object(s) not deleted`);
    return deleted;
  }

  /**
   * Materialises `expired` for a pending Request past 24 business hours
   * (§10.4, §15.1). The queue already treats it as expired; this writes the
   * record, dated when the predicate became true, and moves the row. A
   * refused Decision may already have written the event — then only the row
   * moves.
   */
  private async materialiseExpired(now: Date): Promise<number> {
    const { db, holidays } = this.deps;
    const pending = await db
      .select({ id: request.id, submittedAt: request.submittedAt })
      .from(request)
      .where(eq(request.state, 'pending'));
    let expired = 0;
    for (const row of pending) {
      const expiry = requestExpiry(row.submittedAt, now, holidays);
      if (!expiry.expired) continue;
      await db.transaction(async (tx) => {
        const moved = await tx
          .update(request)
          .set({ state: 'expired' })
          .where(
            sql`${request.id} = ${row.id} AND ${request.state} = 'pending'`,
          )
          .returning({ id: request.id });
        if (moved.length === 0) return;
        const [prior] = await tx
          .select({ id: requestEvent.id })
          .from(requestEvent)
          .where(
            and(
              eq(requestEvent.requestId, row.id),
              eq(requestEvent.type, 'expired'),
            ),
          )
          .limit(1);
        if (!prior) {
          const [{ active }] = await tx
            .select({ active: sql<number>`count(*)::int` })
            .from(reviewer)
            .where(sql`${reviewer.deactivatedAt} IS NULL`);
          await writeRequestEvent(tx, {
            requestId: row.id,
            type: 'expired',
            occurredAt: expiry.expiresAt,
            actor: { actorType: 'system' },
            payload: {
              // When the 24-business-hour clock started: a Request reaches
              // the queue at submit (§2).
              notifiedAt: row.submittedAt.toISOString(),
              businessHoursElapsed: expiry.hoursElapsed,
              reviewerAccountsActive: active,
              decisionAttemptedAndRefused: false,
            },
          });
        }
        expired += 1;
      });
    }
    return expired;
  }

  /**
   * Due mail send-retries (§11.3): each failed send gets its next try once 15
   * minutes have passed, until five are spent — the timer is here, in
   * Postgres, not in a BullMQ backoff a Redis loss would cancel. A send whose
   * job Redis no longer holds cannot be rebuilt (the rendered Delivery is the
   * only place its raw Download token ever existed), so it is abandoned —
   * loudly, through the same `mail_send_abandoned` a fifth failure writes.
   */
  private async retryDueMail(
    now: Date,
  ): Promise<{ retried: number; abandoned: number }> {
    const { mailQueue, mailDeliveries } = this.deps;
    const dueBefore = new Date(now.getTime() - MAIL_RETRY_DELAY_MS);
    let retried = 0;
    let abandoned = 0;
    for (const mail of await mailDeliveries.dueForRetry(
      dueBefore,
      MAIL_MAX_ATTEMPTS,
    )) {
      if ((await mailQueue.retry(mail.id)) === 'retried') {
        await mailDeliveries.markRequeued(mail.id, now);
        retried += 1;
      } else {
        await this.abandonLostMail(mail, now);
        abandoned += 1;
      }
    }
    for (const mail of await mailDeliveries.queuedBefore(dueBefore)) {
      if (await mailQueue.isLive(mail.id)) continue;
      await this.abandonLostMail(mail, now);
      abandoned += 1;
    }
    return { retried, abandoned };
  }

  private async abandonLostMail(
    mail: { id: string; requestId: string },
    now: Date,
  ): Promise<void> {
    const { db, mailDeliveries } = this.deps;
    await mailDeliveries.markAbandoned(
      mail.id,
      await mailDeliveries.attempts(mail.id),
      'the queued send was lost from Redis',
      now,
    );
    await writeRequestEvent(db, {
      requestId: mail.requestId,
      type: 'mail_send_abandoned',
      occurredAt: now,
      actor: { actorType: 'system' },
      payload: {},
    });
    this.logger.warn(`mail ${mail.id} abandoned: its queued job was lost`);
  }

  /**
   * Each approved Request's current Download token — the newest one no Re-run
   * revoked — with what the collection rules need to know about it.
   */
  private async liveTokens(): Promise<LiveToken[]> {
    // Raw SQL leaves pg's timestamp parsing to drizzle, which is off here, so
    // instants come back as epoch milliseconds rather than as text to parse.
    const { rows } = await this.deps.db.execute<{
      request_id: string;
      expires_at: number;
      attempts: number;
      delivered_at: number | null;
      lapse_raised: boolean;
    }>(sql`
      SELECT DISTINCT ON (t.request_id)
        t.request_id,
        (extract(epoch FROM t.expires_at) * 1000)::float8 AS expires_at,
        (SELECT count(*)::int FROM token_lookup l
          WHERE l.download_token_id = t.id
            AND l.kind = 'archive' AND l.outcome = 'success') AS attempts,
        (SELECT (extract(epoch FROM min(e.occurred_at)) * 1000)::float8
          FROM request_event e
          WHERE e.request_id = t.request_id AND e.type = 'mail_sent'
            AND e.payload->>'kind' = 'delivery'
            AND e.occurred_at >= t.created_at) AS delivered_at,
        EXISTS (SELECT 1 FROM request_event e
          WHERE e.request_id = t.request_id
            AND e.type = 'collection_lapse_raised'
            AND e.occurred_at >= t.created_at) AS lapse_raised
      FROM download_token t
      JOIN request r ON r.id = t.request_id
      WHERE r.state = 'approved' AND t.revoked_at IS NULL
      ORDER BY t.request_id, t.created_at DESC
    `);
    return rows.map((row) => ({
      requestId: row.request_id,
      expiresAt: new Date(row.expires_at),
      attempts: row.attempts,
      deliveredAt:
        row.delivered_at === null ? null : new Date(row.delivered_at),
      lapseRaised: row.lapse_raised,
    }));
  }

  /**
   * The collection-lapse trip-wire (§11.4): 24 WALL-CLOCK hours after the
   * Delivery with zero Attempts, raised no earlier than the next business-
   * hours opening. Dated at that raise instant, and carrying the wall-clock
   * hours to it — so a lapse raised on time reads 24, and one whose Alert
   * waited for Monday reads more. A raise that would land after the token has
   * already expired is not an Alert anyone can act on: `expired_uncollected`
   * says it instead.
   */
  private async raiseCollectionLapses(now: Date): Promise<number> {
    let raised = 0;
    for (const token of await this.liveTokens()) {
      if (!token.deliveredAt || token.attempts > 0 || token.lapseRaised) {
        continue;
      }
      const lapse = collectionLapse(token.deliveredAt, this.deps.holidays);
      if (lapse.raisesAt > now || lapse.raisesAt >= token.expiresAt) continue;
      await writeRequestEvent(this.deps.db, {
        requestId: token.requestId,
        type: 'collection_lapse_raised',
        occurredAt: lapse.raisesAt,
        actor: { actorType: 'system' },
        payload: {
          wallClockHoursElapsed:
            Math.round(lapse.wallClockHoursElapsed * 100) / 100,
        },
      });
      raised += 1;
    }
    return raised;
  }

  /**
   * A Request whose current token expired with no Attempt ends in
   * `expired_uncollected` (ADR 0016) — its own terminal state, and the only
   * number that measures whether email is working (§11.5). A collected one is
   * already `collected`: the first Attempt moved it there.
   */
  private async endExpiredDeliveries(now: Date): Promise<number> {
    let ended = 0;
    for (const token of await this.liveTokens()) {
      if (token.expiresAt > now || token.attempts > 0) continue;
      await this.deps.db.transaction(async (tx) => {
        const moved = await tx
          .update(request)
          .set({ state: 'expired_uncollected' })
          .where(
            sql`${request.id} = ${token.requestId} AND ${request.state} = 'approved'`,
          )
          .returning({ id: request.id });
        if (moved.length === 0) return;
        await writeRequestEvent(tx, {
          requestId: token.requestId,
          type: 'expired_uncollected',
          occurredAt: token.expiresAt,
          actor: { actorType: 'system' },
          payload: {},
        });
        ended += 1;
      });
    }
    return ended;
  }
}
