import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { writeRequestEvent } from '../audit/write-request-event';
import { type Db } from '../db/database.module';
import { downloadToken, requestEvent } from '../db/schema';
import { clearAlertOnReRun } from '../reviewer/alert-records';

/**
 * A Re-run's new Extract is ready (spec §10.7): one Request never has two
 * collectable Extracts, so every earlier token still live is revoked now — at
 * ready, never at the press, so a failed Re-run destroys nothing (ADR 0012).
 * The job writes it, so the actor is `system`, and each revocation names the
 * Re-run that superseded it. The superseded objects go on the tick's next
 * pass. Whatever Alert the Re-run deferred is settled in the same breath.
 */
export async function supersedeAtReady(
  db: Db,
  requestId: string,
  readyTokenId: string,
  occurredAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
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
    if (!rerun) return;
    const revoked = await tx
      .update(downloadToken)
      .set({ revokedAt: occurredAt })
      .where(
        and(
          eq(downloadToken.requestId, requestId),
          isNull(downloadToken.revokedAt),
          ne(downloadToken.id, readyTokenId),
        ),
      )
      .returning({ id: downloadToken.id });
    for (let i = 0; i < revoked.length; i++) {
      await writeRequestEvent(tx, {
        requestId,
        type: 'download_token_revoked',
        occurredAt,
        actor: { actorType: 'system' },
        payload: { supersededByEventId: rerun.id },
      });
    }
    await clearAlertOnReRun(tx, requestId, occurredAt);
  });
}
