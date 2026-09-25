import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { writeRequestEvent } from '../audit/write-request-event';
import { type Db } from '../db/database.module';
import {
  downloadToken,
  request,
  requestEvent,
  tokenLookup,
} from '../db/schema';
import { settledState } from '../requests/in-flight';
import { currentToken } from '../requests/in-flight-records';
import { clearAlertOnRerun } from '../reviewer/alert-records';
import { hashToken } from './token';
import { type DownloadTokenRow } from './resolve-token';

/** From job completion, never extended (§9.3). The lifecycle backstop rests on it: `extraction/bucket-lifecycle.ts`. */
export const DOWNLOAD_TOKEN_LIFETIME_HOURS = 72;
const LIFETIME_MS = DOWNLOAD_TOKEN_LIFETIME_HOURS * 60 * 60 * 1000;

export class DownloadTokens {
  constructor(private readonly db: Db) {}

  /**
   * An Extract is ready (spec §9.3, §10.7): its token is issued, and — for a
   * Re-run — every earlier token still live is revoked and the Alert the
   * Re-run deferred is settled, all in one transaction, so there is never a
   * moment with two collectable Extracts (ADR 0012). The revocation is the
   * job's, so its actor is `system`, naming the Re-run that superseded it.
   *
   * Null when the Request has ended while the job ran — collected, or its
   * link lapsed (ADR 0016) — and then nothing is issued: a Re-run must never
   * revive a Request no Reviewer action may revive.
   */
  async issueAtReady(
    requestId: string,
    rawToken: string,
    archiveFilename: string,
    now: Date,
  ): Promise<DownloadTokenRow | null> {
    return this.db.transaction(async (tx) => {
      // Locked, so a collection or the tick's expiry cannot land between the
      // check and the issue.
      const [row] = await tx
        .select({ state: request.state })
        .from(request)
        .where(eq(request.id, requestId))
        .for('update');
      const previous = await currentToken(tx, requestId);
      if (!row || settledState(row.state, previous, now) !== 'approved') {
        return null;
      }
      const [issued] = await tx
        .insert(downloadToken)
        .values({
          requestId,
          tokenHash: hashToken(rawToken),
          archiveFilename,
          createdAt: now,
          expiresAt: new Date(now.getTime() + LIFETIME_MS),
        })
        .returning();

      const [rerun] = await tx
        .select({ id: requestEvent.id })
        .from(requestEvent)
        .where(
          and(
            eq(requestEvent.requestId, requestId),
            eq(requestEvent.type, 'extraction_rerun_queued'),
          ),
        )
        .orderBy(desc(requestEvent.id))
        .limit(1);
      if (!rerun) return issued;
      // One at most: this is the rule that keeps it so.
      const revoked = await tx
        .update(downloadToken)
        .set({ revokedAt: now })
        .where(
          and(
            eq(downloadToken.requestId, requestId),
            isNull(downloadToken.revokedAt),
            ne(downloadToken.id, issued.id),
          ),
        )
        .returning({ id: downloadToken.id });
      for (let i = 0; i < revoked.length; i++) {
        await writeRequestEvent(tx, {
          requestId,
          type: 'download_token_revoked',
          occurredAt: now,
          actor: { actorType: 'system' },
          payload: { supersededByEventId: rerun.id },
        });
      }
      await clearAlertOnRerun(tx, requestId, now);
      return issued;
    });
  }

  async findByRawToken(rawToken: string): Promise<DownloadTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(downloadToken)
      .where(eq(downloadToken.tokenHash, hashToken(rawToken)));
    return row ?? null;
  }

  /** Prior *successful* archive-route presentations of this token — the cap (spec §9.2). */
  async successfulArchiveAttempts(downloadTokenId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokenLookup)
      .where(
        and(
          eq(tokenLookup.downloadTokenId, downloadTokenId),
          eq(tokenLookup.kind, 'archive'),
          eq(tokenLookup.outcome, 'success'),
        ),
      );
    return count;
  }
}
