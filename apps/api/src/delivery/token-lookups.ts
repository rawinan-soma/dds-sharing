import { type Db } from '../db/database.module';
import { tokenLookup } from '../db/schema';
import { moveRequestState } from '../requests/move-request-state';
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
 *
 * The first successful Attempt also moves the Request to `collected` (spec
 * §2): a terminal state, and the opposite outcome from `expired_uncollected`,
 * which the tick writes for a token that expires with none (§11.5). Only an
 * `approved` Request moves; any later Attempt finds it already there.
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
    const requestId = params.requestId;
    await db.transaction(async (tx) => {
      await moveRequestState(tx, requestId, 'approved', 'collected');
      await writeRequestEvent(tx, {
        requestId,
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
    });
  }
}
