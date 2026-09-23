import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, lte, ne, or } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { reviewer, reviewerSession } from '../db/schema';
import { type Clock } from './clock';
import { writeReviewerEvent } from './reviewer-events';

/** Slides: only a user-initiated request moves it. */
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
/** From login, and never extended: a ceiling with an exception is not one. */
export const CEILING_MS = 6 * 60 * 60 * 1000;
/** A hygiene bound, not a control. The oldest is evicted. */
export const MAX_CONCURRENT_SESSIONS = 3;

export interface ActiveSession {
  reviewerId: string;
  displayName: string;
  mustChangePassword: boolean;
  createdAt: Date;
  /** The absolute ceiling. */
  expiresAt: Date;
}

export type ResolvedSession =
  | { status: 'valid'; session: ActiveSession }
  | { status: 'expired' }
  | { status: 'none' };

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

// Sessions live in Postgres so deactivation is a query rather than a cache
// invalidation, and a flush cannot resurrect anything.
export class ReviewerSessions {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** Opens a session, evicting the oldest ones beyond the cap. */
  async create(
    reviewerId: string,
    tx: Pick<Db, 'insert' | 'select' | 'delete'> = this.db,
  ): Promise<{ token: string; expiresAt: Date }> {
    const now = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    await tx.insert(reviewerSession).values({
      tokenHash: hashToken(token),
      reviewerId,
      createdAt: now,
      lastSeenAt: now,
    });
    const mine = await tx
      .select({ id: reviewerSession.id })
      .from(reviewerSession)
      .where(eq(reviewerSession.reviewerId, reviewerId))
      .orderBy(asc(reviewerSession.createdAt), asc(reviewerSession.id));
    const evict = mine.slice(
      0,
      Math.max(0, mine.length - MAX_CONCURRENT_SESSIONS),
    );
    if (evict.length > 0) {
      await tx.delete(reviewerSession).where(
        inArray(
          reviewerSession.id,
          evict.map((s) => s.id),
        ),
      );
    }
    return { token, expiresAt: new Date(now.getTime() + CEILING_MS) };
  }

  /**
   * Looks a session up. `touch` is for user-initiated requests only: it moves
   * the idle window and never the ceiling. An expired session is deleted and
   * its `session_expired` written exactly once, by whichever request finds it.
   */
  async resolve(
    token: string | undefined,
    options: { touch: boolean },
  ): Promise<ResolvedSession> {
    if (!token) return { status: 'none' };
    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select({
        id: reviewerSession.id,
        createdAt: reviewerSession.createdAt,
        lastSeenAt: reviewerSession.lastSeenAt,
        reviewerId: reviewer.id,
        displayName: reviewer.displayName,
        mustChangePassword: reviewer.mustChangePassword,
        deactivatedAt: reviewer.deactivatedAt,
        totpConfirmedAt: reviewer.totpConfirmedAt,
      })
      .from(reviewerSession)
      .innerJoin(reviewer, eq(reviewer.id, reviewerSession.reviewerId))
      .where(eq(reviewerSession.tokenHash, tokenHash));
    if (!row) return { status: 'none' };

    // Defence in depth: deactivation already deleted the row, but a session is
    // never honoured for a Reviewer who may not sign in.
    if (row.deactivatedAt || !row.totpConfirmedAt) {
      await this.db
        .delete(reviewerSession)
        .where(eq(reviewerSession.id, row.id));
      return { status: 'none' };
    }

    const now = this.clock.now().getTime();
    const pastCeiling = now - row.createdAt.getTime() >= CEILING_MS;
    const pastIdle = now - row.lastSeenAt.getTime() >= IDLE_TIMEOUT_MS;
    if (pastCeiling || pastIdle) {
      await this.expire(row.id, row.reviewerId);
      return { status: 'expired' };
    }

    if (options.touch) {
      await this.db
        .update(reviewerSession)
        .set({ lastSeenAt: this.clock.now() })
        .where(eq(reviewerSession.id, row.id));
    }
    return {
      status: 'valid',
      session: {
        reviewerId: row.reviewerId,
        displayName: row.displayName,
        mustChangePassword: row.mustChangePassword,
        createdAt: row.createdAt,
        expiresAt: new Date(row.createdAt.getTime() + CEILING_MS),
      },
    };
  }

  private async expire(sessionId: string, reviewerId: string) {
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(reviewerSession)
        .where(eq(reviewerSession.id, sessionId))
        .returning({ id: reviewerSession.id });
      // Two requests can find the same dead session; only one wins the delete.
      if (deleted.length === 0) return;
      await writeReviewerEvent(tx, {
        type: 'session_expired',
        occurredAt: this.clock.now(),
        actor: { actorType: 'reviewer', reviewerId },
        payload: {},
      });
    });
  }

  /**
   * The tick's pruning (spec §15.4): deletes every session past its idle
   * window or its ceiling, and writes `session_expired` for each — the same
   * record `resolve` writes when a request finds one first, dated when the
   * session actually died. The row is operational state; the event is the
   * record, and on the event table the cleanup is an insert.
   */
  async pruneDead(now: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      const dead = await tx
        .delete(reviewerSession)
        .where(
          or(
            lte(
              reviewerSession.lastSeenAt,
              new Date(now.getTime() - IDLE_TIMEOUT_MS),
            ),
            lte(
              reviewerSession.createdAt,
              new Date(now.getTime() - CEILING_MS),
            ),
          ),
        )
        .returning({
          reviewerId: reviewerSession.reviewerId,
          createdAt: reviewerSession.createdAt,
          lastSeenAt: reviewerSession.lastSeenAt,
        });
      for (const session of dead) {
        const diedAt = Math.min(
          session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS,
          session.createdAt.getTime() + CEILING_MS,
        );
        await writeReviewerEvent(tx, {
          type: 'session_expired',
          occurredAt: new Date(diedAt),
          actor: { actorType: 'reviewer', reviewerId: session.reviewerId },
          payload: {},
        });
      }
      return dead.length;
    });
  }

  /** Ends the one session; true when there was one to end. */
  async destroy(token: string): Promise<boolean> {
    const deleted = await this.db
      .delete(reviewerSession)
      .where(eq(reviewerSession.tokenHash, hashToken(token)))
      .returning({ id: reviewerSession.id });
    return deleted.length > 0;
  }

  /** Every session of a Reviewer except the one named. */
  async destroyOthers(
    reviewerId: string,
    keepToken: string,
    tx: Pick<Db, 'delete'> = this.db,
  ): Promise<void> {
    const keep = hashToken(keepToken);
    await tx
      .delete(reviewerSession)
      .where(
        and(
          eq(reviewerSession.reviewerId, reviewerId),
          ne(reviewerSession.tokenHash, keep),
        ),
      );
  }
}
