import { Logger, type LoggerService } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { type Pool } from 'pg';
import { type ObjectDeletedOutcome } from '../audit/event-catalogue';
import { mailSentOfKind } from '../audit/mail-sent';
import { queueNotifiedAt } from '../audit/queue-notified-at';
import { writeRequestEvent } from '../audit/write-request-event';
import { ADVISORY_LOCK } from '../db/advisory-locks';
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
import {
  type MailDeliveries,
  type PendingSend,
} from '../mail/mail-delivery.repository';
import {
  MAIL_MAX_ATTEMPTS,
  MAIL_RETRY_DELAY_MS,
  type MailQueue,
} from '../mail/mail-queue';
import { requestExpiry } from '../clock/business-hours';
import { type Clock } from '../clock/clock';
import { moveRequestState } from '../requests/move-request-state';
import { type LoginThrottle } from '../reviewer/login-throttle';
import { type ReviewerSessions } from '../reviewer/reviewer-sessions';
import { collectionLapse } from './collection-lapse';
import { objectsStillHeld } from './scheduler-health';
import { withTimeout } from './with-timeout';

/** A MinIO call slower than this fails its step rather than stalling the pass. */
export const OBJECT_STORE_TIMEOUT_MS = 30_000;

/** Every pass takes this one lock (spec §15.3). */
export const TICK_LOCK_KEY = ADVISORY_LOCK.tick;

/**
 * `startup` is the same pass with no lower bound on "due", and it touches
 * exactly two things: unfinished extractions (`queued` or `running`, §7.7) and
 * expired-token objects — plus the lifecycle backstop, until it is applied. It
 * never touches `pending`: an unapproved Request has no work, and its clock is
 * derived (§15.3).
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
  /** Set once the MinIO lifecycle backstop has been applied by this process. */
  private backstopApplied = false;
  /**
   * Objects this process has asked MinIO to remove whose removal it has not
   * yet recorded — a call that timed out may still have removed the object,
   * and finding it gone next pass is then this application's deletion, not
   * the backstop's. Lost on restart, when such an object reads
   * `already_absent`: the one case where the record under-claims.
   */
  private readonly removalsIssued = new Set<string>();

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
    const startup = mode === 'startup';
    let failures = 0;
    // One job failing must not stop the others: a broken MinIO is no reason
    // to stop expiring Requests. The failure is loud in the log, and withholds
    // the heartbeat, so it is loud on the banner and /health too.
    const step = async <T>(
      name: string,
      nothingDone: T,
      run: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await run();
      } catch (error) {
        this.logger.error(
          `tick step ${name} failed: ${(error as Error).message}`,
        );
        failures += 1;
        return nothingDone;
      }
    };

    if (!this.backstopApplied) {
      await step('backstop', undefined, () => this.applyBackstop());
    }
    const report: PassReport = {
      extractionsReenqueued: await step('extractions', 0, () =>
        this.reconcileExtractions(startup ? null : now),
      ),
      objectsDeleted: await step('objects', 0, () =>
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
      report.requestsExpired = await step('expiry', 0, () =>
        this.materialiseExpired(now),
      );
      const mail = await step('mail', { retried: 0, abandoned: 0 }, () =>
        this.retryDueMail(now),
      );
      report.mailRetried = mail.retried;
      report.mailAbandoned = mail.abandoned;
      const collection = await step(
        'collection',
        { lapsesRaised: 0, requestsEnded: 0 },
        () => this.settleDeliveries(now),
      );
      report.lapsesRaised = collection.lapsesRaised;
      report.requestsEnded = collection.requestsEnded;
      report.sessionsPruned = await step('sessions', 0, () =>
        this.deps.sessions.pruneDead(now),
      );
      report.throttleRowsPruned = await step('throttle', 0, () =>
        this.deps.loginThrottle.pruneDecayed(now),
      );
    }
    // The heartbeat means the whole pass did its work. A pass with a failed
    // job does not beat: four ways to be half-alive is what one pass exists
    // to rule out (§15.3), and five such passes put the banner up.
    if (failures === 0) await this.beat(now);
    return report;
  }

  /**
   * The MinIO lifecycle rule (§9.5): the backstop, applied by the tick so a
   * failure to apply it is not a log line at boot but a job that fails every
   * pass — withholding the heartbeat — until it takes.
   */
  private async applyBackstop(): Promise<void> {
    await withTimeout(
      this.deps.archiveStore.prepareBucket(),
      OBJECT_STORE_TIMEOUT_MS,
      'lifecycle backstop',
    );
    this.backstopApplied = true;
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
   * pass rather than at its own expiry (ADR 0012). An object already gone,
   * that this process never asked to remove — the lifecycle backstop got there
   * first — is recorded as such, never skipped. A failed delete writes no
   * record and is tried again next pass;
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
        const present =
          (await withTimeout(
            archiveStore.stat(objectKey),
            OBJECT_STORE_TIMEOUT_MS,
            `stat of ${objectKey}`,
          )) !== null;
        if (present) {
          this.removalsIssued.add(objectKey);
          await withTimeout(
            archiveStore.remove(objectKey),
            OBJECT_STORE_TIMEOUT_MS,
            `removal of ${objectKey}`,
          );
        }
        const outcome: ObjectDeletedOutcome =
          present || this.removalsIssued.has(objectKey)
            ? 'deleted'
            : 'already_absent';
        await writeRequestEvent(db, {
          requestId,
          type: 'object_deleted',
          occurredAt: now,
          actor: { actorType: 'system' },
          payload: { objectKey, outcome },
        });
        this.removalsIssued.delete(objectKey);
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
    const { db } = this.deps;
    const pending = await db
      .select({ id: request.id, submittedAt: request.submittedAt })
      .from(request)
      .where(eq(request.state, 'pending'));
    let expired = 0;
    for (const row of pending) {
      const expiry = requestExpiry(row.submittedAt, now);
      if (!expiry.expired) continue;
      await db.transaction(async (tx) => {
        if (!(await moveRequestState(tx, row.id, 'pending', 'expired'))) {
          return;
        }
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
              notifiedAt: await queueNotifiedAt(tx, row.id),
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

  private async abandonLostMail(mail: PendingSend, now: Date): Promise<void> {
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
        (SELECT (extract(epoch FROM min(${requestEvent.occurredAt})) * 1000)::float8
          FROM ${requestEvent}
          WHERE ${requestEvent.requestId} = t.request_id
            AND ${mailSentOfKind('delivery')}
            AND ${requestEvent.occurredAt} >= t.created_at) AS delivered_at,
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
   * The collection rules, over one read of the live tokens. A token that
   * expired with no Attempt ends its Request; one still live may trip the
   * lapse.
   */
  private async settleDeliveries(
    now: Date,
  ): Promise<{ lapsesRaised: number; requestsEnded: number }> {
    let lapsesRaised = 0;
    let requestsEnded = 0;
    for (const token of await this.liveTokens()) {
      if (token.attempts > 0) continue;
      if (token.expiresAt <= now) {
        if (await this.endUncollected(token)) requestsEnded += 1;
      } else if (await this.raiseLapse(token, now)) {
        lapsesRaised += 1;
      }
    }
    return { lapsesRaised, requestsEnded };
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
  private async raiseLapse(token: LiveToken, now: Date): Promise<boolean> {
    if (!token.deliveredAt || token.lapseRaised) return false;
    const lapse = collectionLapse(token.deliveredAt);
    if (lapse.raisesAt > now || lapse.raisesAt >= token.expiresAt) return false;
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
    return true;
  }

  /**
   * A Request whose current token expired with no Attempt ends in
   * `expired_uncollected` (ADR 0016) — its own terminal state, and the only
   * number that measures whether email is working (§11.5). A collected one is
   * already `collected`: the first Attempt moved it there.
   */
  private async endUncollected(token: LiveToken): Promise<boolean> {
    return this.deps.db.transaction(async (tx) => {
      const moved = await moveRequestState(
        tx,
        token.requestId,
        'approved',
        'expired_uncollected',
      );
      if (!moved) return false;
      await writeRequestEvent(tx, {
        requestId: token.requestId,
        type: 'expired_uncollected',
        occurredAt: token.expiresAt,
        actor: { actorType: 'system' },
        payload: {},
      });
      return true;
    });
  }
}
