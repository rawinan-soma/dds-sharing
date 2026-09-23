import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { type JobFailureCause } from '../audit/event-catalogue';
import { extractionJob } from '../db/schema';
import { type ExtractionSummary } from './extraction-pipeline';

/** Anything that can run a query: the database, or a transaction of it (see
 * `writeRequestEvent`) — `approve` writes the job row in the same transaction
 * as the `approved` and `job_queued` events (spec §7.7). */

type Executor =
  NodePgDatabase<Record<string, never>> | PgTransaction<any, any, any>;

/**
 * Writes the queued job row (spec §7.7: "a job row is written to Postgres at
 * approval"). The BullMQ job is enqueued by the caller after commit, using
 * this row's id as the BullMQ job id — the one thing that lets reconcile ask
 * "is there a live BullMQ job for this Postgres row".
 */
export async function insertQueuedJob(
  db: Executor,
  requestId: string,
): Promise<string> {
  const [{ id }] = await db
    .insert(extractionJob)
    .values({ requestId, status: 'queued' })
    .returning({ id: extractionJob.id });
  return id;
}

export class ExtractionJobs {
  constructor(private readonly db: NodePgDatabase) {}

  async markRunning(jobId: string, now: Date): Promise<void> {
    await this.db
      .update(extractionJob)
      .set({ status: 'running', startedAt: now, lastProgressAt: now })
      .where(eq(extractionJob.id, jobId));
  }

  async touch(jobId: string, now: Date): Promise<void> {
    await this.db
      .update(extractionJob)
      .set({ lastProgressAt: now })
      .where(eq(extractionJob.id, jobId));
  }

  async markSucceeded(
    jobId: string,
    now: Date,
    summary: ExtractionSummary,
  ): Promise<void> {
    await this.db
      .update(extractionJob)
      .set({ status: 'succeeded', finishedAt: now, result: summary })
      .where(eq(extractionJob.id, jobId));
  }

  async markFailed(
    jobId: string,
    now: Date,
    cause: JobFailureCause,
    summary: ExtractionSummary | null,
  ): Promise<void> {
    await this.db
      .update(extractionJob)
      .set({
        status: 'failed',
        finishedAt: now,
        failureCause: cause,
        result: summary,
      })
      .where(eq(extractionJob.id, jobId));
  }

  /**
   * Jobs left `queued` or `running` — the only two non-terminal states — for
   * the tick to check against BullMQ (spec §7.7, §15.3). `quietSince` is the
   * lower bound on "due": a job counts only once it has shown no progress
   * since then. The startup reconcile passes `null`, because a process that
   * just started has no job of its own in flight. Never `pending`: that state
   * belongs to `request`, not `extraction_job`, and does not exist here.
   */
  async unfinished(
    quietSince: Date | null,
  ): Promise<{ id: string; requestId: string }[]> {
    const unfinished = inArray(extractionJob.status, ['queued', 'running']);
    return this.db
      .select({ id: extractionJob.id, requestId: extractionJob.requestId })
      .from(extractionJob)
      .where(
        quietSince
          ? and(
              unfinished,
              or(
                lte(extractionJob.lastProgressAt, quietSince),
                and(
                  sql`${extractionJob.lastProgressAt} IS NULL`,
                  lte(extractionJob.createdAt, quietSince),
                ),
              ),
            )
          : unfinished,
      );
  }
}
