import { Logger } from '@nestjs/common';
import { type ExtractionJobs } from './extraction-jobs.repository';
import { type ExtractionQueue } from './extraction-queue';

/**
 * On worker startup, reconcile (spec §7.7): any Postgres job left `queued` or
 * `running` with no live BullMQ job is re-enqueued. Redis is not durable by
 * default, and a restart on the wrong persistence config drops queued jobs
 * while Postgres still says those Requests exist — this is the other half of
 * that guarantee, alongside Redis's own AOF persistence. Code-atomic retry
 * (spec §7.6: every Report code always restarts from page 1) is what makes
 * re-running the whole job from scratch safe.
 *
 * Never touches `pending` — that is not a state `extraction_job` has at all.
 */
export async function reconcileExtractionJobs(
  jobs: ExtractionJobs,
  queue: ExtractionQueue,
  logger = new Logger('ExtractionReconcile'),
): Promise<number> {
  const unfinished = await jobs.unfinished();
  let reenqueued = 0;
  for (const { id, requestId } of unfinished) {
    if (await queue.reenqueueIfNotLive(id, requestId)) reenqueued += 1;
  }
  if (reenqueued > 0) {
    logger.log(`reconciled ${reenqueued} extraction job(s) at startup`);
  }
  return reenqueued;
}
