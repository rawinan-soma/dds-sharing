import { and, eq, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { failedOnUnrecognisedProvinceCode } from '../extraction/extraction-jobs.repository';
import { type PassFailHealth } from '../health/component-health';
import { downloadToken, requestEvent, schedulerHeartbeat } from '../db/schema';

export type SchedulerHealth = PassFailHealth;

/** Five missed 60-second passes: unambiguous (§15.3). */
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
/** An object still present this long after it fell due is a scheduler fault (§9.5). */
export const OBJECT_OVERDUE_MS = 60 * 60 * 1000;

export interface SchedulerFacts {
  lastBeatAt: Date | null;
  overdueObjects: number;
  /** A job met an `epidem_chw_code` outside the province table it holds now. */
  unrecognisedProvinceCode: boolean;
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
  if (facts.unrecognisedProvinceCode) {
    return { status: 'degraded', reason: 'the province table is stale' };
  }
  return { status: 'ok' };
}

/**
 * Download tokens whose object fell due by `dueBy` and that no
 * `object_deleted` names yet. The deletion record is the evidence (§9.5): an
 * object counts as still present until one does — and one is only ever
 * written once the object is known to be gone.
 */
export function objectsStillHeld(db: Db, dueBy: Date): SQL | undefined {
  return and(
    or(
      lte(downloadToken.expiresAt, dueBy),
      lte(downloadToken.revokedAt, dueBy),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(requestEvent)
        .where(
          and(
            eq(requestEvent.requestId, downloadToken.requestId),
            eq(requestEvent.type, 'object_deleted'),
            sql`${requestEvent.payload}->>'objectKey' = ${downloadToken.archiveFilename}`,
          ),
        ),
    ),
  );
}

export async function readSchedulerFacts(
  db: Db,
  now: Date,
  provincesChecksum: string,
): Promise<SchedulerFacts> {
  const [beat] = await db
    .select({ beatAt: schedulerHeartbeat.beatAt })
    .from(schedulerHeartbeat);
  const [{ overdue }] = await db
    .select({ overdue: sql<number>`count(*)::int` })
    .from(downloadToken)
    .where(objectsStillHeld(db, new Date(now.getTime() - OBJECT_OVERDUE_MS)));
  return {
    lastBeatAt: beat?.beatAt ?? null,
    overdueObjects: overdue,
    unrecognisedProvinceCode: await failedOnUnrecognisedProvinceCode(
      db,
      provincesChecksum,
    ),
  };
}

export async function schedulerHealth(
  db: Db,
  now: Date,
  provincesChecksum: string,
): Promise<SchedulerHealth> {
  return schedulerStatus(
    await readSchedulerFacts(db, now, provincesChecksum),
    now,
  );
}
