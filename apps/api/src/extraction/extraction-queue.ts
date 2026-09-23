import { Queue } from 'bullmq';
import { LIVE_JOB_STATES } from '../db/bull-job-states';
import { EXTRACTION_QUEUE_NAME } from './extraction.config';

/** The BullMQ job payload: the Request id and nothing fetched (spec §14.5) —
 * a failed job sitting in Redis must hold no rows. */
export interface ExtractionJobData {
  requestId: string;
}

/**
 * A thin wrapper over the BullMQ `Queue`. The Postgres `extraction_job.id` is
 * always used as the BullMQ job id — that identity is what lets the reconcile
 * ask "is there a live BullMQ job for this Postgres row" (spec §7.7).
 */
export class ExtractionQueue {
  constructor(private readonly queue: Queue<ExtractionJobData>) {}

  async enqueue(jobId: string, requestId: string): Promise<void> {
    await this.queue.add(
      'extract',
      { requestId },
      {
        jobId,
        // Bull Board is a debugging tool with no watcher obligation (spec
        // §14.4); Postgres, not Redis, is the durable record of what ran.
        removeOnComplete: true,
        removeOnFail: { count: 1000 },
      },
    );
  }

  async isLive(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    return LIVE_JOB_STATES.has(await job.getState());
  }

  /**
   * Re-enqueues a Postgres row the reconcile found with no live BullMQ job
   * (spec §7.7). A stale terminal job under the same id — the crash-mid-job
   * edge case, not the common one — is removed first: `add` with a jobId
   * that already exists returns the existing job rather than starting a new
   * run, which is exactly what must not happen here.
   */
  async reenqueueIfNotLive(jobId: string, requestId: string): Promise<boolean> {
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      if (LIVE_JOB_STATES.has(await existing.getState())) return false;
      await existing.remove();
    }
    await this.enqueue(jobId, requestId);
    return true;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export { EXTRACTION_QUEUE_NAME };
