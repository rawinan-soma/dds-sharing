import { desc, inArray } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { extractionJob } from '../db/schema';
import { type PassFailHealth } from '../health/component-health';

export type ExtractionHealth = PassFailHealth;

type FinishedStatus = 'succeeded' | 'failed';

/**
 * Spec §14.1: *one failure is a Requester's problem; two is an outage.*
 * Consecutive, not a rate — at `N=1` concurrency a windowed rate has too few
 * samples to mean anything — so a success resets the count. `recent` is the
 * last finished jobs, most recent first.
 */
export function extractionStatus(
  recent: readonly FinishedStatus[],
): ExtractionHealth {
  if (recent.length >= 2 && recent[0] === 'failed' && recent[1] === 'failed') {
    return {
      status: 'degraded',
      reason: 'consecutive extraction jobs have failed',
    };
  }
  return { status: 'ok' };
}

export async function extractionHealth(db: Db): Promise<ExtractionHealth> {
  const rows = await db
    .select({ status: extractionJob.status })
    .from(extractionJob)
    .where(inArray(extractionJob.status, ['succeeded', 'failed']))
    .orderBy(desc(extractionJob.finishedAt), desc(extractionJob.createdAt))
    .limit(2);
  return extractionStatus(rows.map((r) => r.status as FinishedStatus));
}
