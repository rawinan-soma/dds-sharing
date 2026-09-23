import { Queue } from 'bullmq';
import { type MailKind } from '../audit/event-catalogue';

export const MAIL_QUEUE_NAME = 'mail';

// 5 tries over roughly an hour (spec §11.3): +0/15/30/45/60 minutes, each
// retry started by the tick once its 15 minutes are up.
export const MAIL_MAX_ATTEMPTS = 5;
export const MAIL_RETRY_DELAY_MS = 15 * 60 * 1000;

const LIVE_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized']);

export interface MailJobData {
  mailDeliveryId: string;
  requestId: string;
  kind: MailKind;
  to: string;
  subject: string;
  html: string;
}

/**
 * A thin wrapper over the BullMQ `Queue`, mirroring `ExtractionQueue`: the
 * `mail_delivery.id` is always the BullMQ job id, so the tick can find the job
 * a Postgres row describes.
 *
 * BullMQ makes one try per job and holds no retry schedule of its own (spec
 * §15.3): a backoff living only in Redis is a schedule a Redis loss silently
 * cancels. A failed try stays in the failed set, carrying the rendered
 * message, until the tick finds its row due and calls {@link retry}.
 */
export class MailQueue {
  constructor(private readonly queue: Queue<MailJobData>) {}

  async enqueue(data: MailJobData): Promise<void> {
    await this.queue.add('send', data, {
      jobId: data.mailDeliveryId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
    });
  }

  /**
   * Starts the next try of a failed send. `lost` when Redis no longer holds
   * the job: the rendered message went with it — the Delivery's Download
   * token exists nowhere else in raw form — so it cannot be rebuilt, only
   * abandoned loudly.
   */
  async retry(mailDeliveryId: string): Promise<'retried' | 'lost'> {
    const job = await this.queue.getJob(mailDeliveryId);
    if (!job || (await job.getState()) !== 'failed') return 'lost';
    await job.retry('failed');
    return 'retried';
  }

  async isLive(mailDeliveryId: string): Promise<boolean> {
    const job = await this.queue.getJob(mailDeliveryId);
    return !!job && LIVE_STATES.has(await job.getState());
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
