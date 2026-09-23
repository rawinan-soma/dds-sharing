import { type Db } from '../db/database.module';
import { tokenLookup } from '../db/schema';
import { writeRequestEvent } from '../audit/write-request-event';
import { type LookupOutcome } from './resolve-token';
import { tokenPrefix } from './token';

export interface LookupContext {
  ip: string;
  userAgent: string;
}

/**
 * Writes one `token_lookup` audit row (spec §12.3, append-only). A
 * *successful archive* presentation is also mirrored to `download_attempted`
 * on the Request's own event stream (ADR 0018) — accountability
 * ("who collected this Extract?") and abuse ("is one IP sweeping the token
 * space?") ask different questions of the same fact, and the second must not
 * filter out the first.
 */
export async function recordLookup(
  db: Db,
  params: {
    rawToken: string;
    downloadTokenId: string | null;
    requestId: string | null;
    kind: 'page' | 'archive';
    outcome: LookupOutcome;
    now: Date;
  } & LookupContext,
): Promise<void> {
  await db.insert(tokenLookup).values({
    downloadTokenId: params.downloadTokenId,
    requestId: params.requestId,
    tokenPrefix: tokenPrefix(params.rawToken),
    kind: params.kind,
    outcome: params.outcome,
    ip: params.ip,
    userAgent: params.userAgent,
    occurredAt: params.now,
  });

  if (
    params.kind === 'archive' &&
    params.outcome === 'success' &&
    params.requestId
  ) {
    await writeRequestEvent(db, {
      requestId: params.requestId,
      type: 'download_attempted',
      occurredAt: params.now,
      actor: {
        actorType: 'anonymous',
        ip: params.ip,
        userAgent: params.userAgent,
      },
      payload: {
        tokenPrefix: tokenPrefix(params.rawToken),
        outcome: params.outcome,
      },
    });
  }
}
