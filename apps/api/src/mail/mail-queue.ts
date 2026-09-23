import { Queue } from 'bullmq';
import { type MailKind } from '../audit/event-catalogue';

export const MAIL_QUEUE_NAME = 'mail';

// 5 tries over roughly an hour (spec §11.3): +0/15/30/45/60 minutes.
export const MAIL_MAX_ATTEMPTS = 5;
export const MAIL_RETRY_DELAY_MS = 15 * 60 * 1000;

export interface MailJobData {
  mailDeliveryId: string;
  requestId: string;
  kind: MailKind;
  to: string;
  subject: string;
  html: string;
}

/** A thin wrapper over the BullMQ `Queue`, mirroring `ExtractionQueue`. */
export class MailQueue {
  constructor(private readonly queue: Queue<MailJobData>) {}

  async enqueue(data: MailJobData): Promise<void> {
    await this.queue.add('send', data, {
      attempts: MAIL_MAX_ATTEMPTS,
      backoff: { type: 'fixed', delay: MAIL_RETRY_DELAY_MS },
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
