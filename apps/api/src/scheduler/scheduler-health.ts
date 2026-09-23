import { and, eq, lte, notExists, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { downloadToken, requestEvent, schedulerHeartbeat } from '../db/schema';

export type SchedulerHealth =
  { status: 'ok' } | { status: 'degraded'; reason: string };

/** Five missed 60-second passes: unambiguous (§15.3). */
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
/** An object still present this long past its token's expiry is a scheduler fault (§9.5). */
export const OBJECT_OVERDUE_MS = 60 * 60 * 1000;

export interface SchedulerFacts {
  lastBeatAt: Date | null;
  overdueObjects: number;
}

/**
 * The one fact behind both consumers (§15.3): the Thai banner on the Reviewer
 * queue and the `scheduler` health component. The reason is for the operator
 * and carries no count — `/health` is statuses only (§14.1).
 */
export function schedulerStatus(
  facts: SchedulerFacts,
  now: Date,
): SchedulerHealth {
  if (
    !facts.lastBeatAt ||
    now.getTime() - facts.lastBeatAt.getTime() > HEARTBEAT_STALE_MS
  ) {
    return { status: 'degraded', reason: 'the tick has stopped' };
  }
  if (facts.overdueObjects > 0) {
    return {
      status: 'degraded',
      reason: 'an Extract outlived its Download token by over an hour',
    };
  }
  return { status: 'ok' };
}

/**
 * The deletion record is the evidence (§9.5): an object counts as still
 * present until an `object_deleted` names it with an outcome that settled it.
 */
export const settledDeletion = (objectKey: unknown) =>
  and(
    eq(requestEvent.requestId, downloadToken.requestId),
    eq(requestEvent.type, 'object_deleted'),
    sql`${requestEvent.payload}->>'objectKey' = ${objectKey}`,
    sql`${requestEvent.payload}->>'outcome' IN ('deleted', 'already_absent')`,
  );

export async function readSchedulerFacts(
  db: Db,
  now: Date,
): Promise<SchedulerFacts> {
  const [beat] = await db
    .select({ beatAt: schedulerHeartbeat.beatAt })
    .from(schedulerHeartbeat);
  const [{ overdue }] = await db
    .select({ overdue: sql<number>`count(*)::int` })
    .from(downloadToken)
    .where(
      and(
        lte(
          downloadToken.expiresAt,
          new Date(now.getTime() - OBJECT_OVERDUE_MS),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(requestEvent)
            .where(settledDeletion(downloadToken.archiveFilename)),
        ),
      ),
    );
  return { lastBeatAt: beat?.beatAt ?? null, overdueObjects: overdue };
}

export async function schedulerHealth(
  db: Db,
  now: Date,
): Promise<SchedulerHealth> {
  return schedulerStatus(await readSchedulerFacts(db, now), now);
}
