import { Logger, type LoggerService } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { writeRequestEvent } from '../audit/write-request-event';
import { type Db } from '../db/database.module';
import { type MailDeliveries } from './mail-delivery.repository';
import {
  MAIL_MAX_ATTEMPTS,
  MAIL_QUEUE_NAME,
  type MailJobData,
} from './mail-queue';
import { type MailTransport } from './mail-transport';

export interface MailWorkerDeps {
  db: Db;
  transport: MailTransport;
  mailDeliveries: MailDeliveries;
  from: string;
  connection: Redis;
  prefix?: string;
  now?: () => Date;
  logger?: LoggerService;
}

/** What the processor needs from a BullMQ `Job` — narrowed for testability. */
export interface MailJobLike {
  data: MailJobData;
  attemptsMade: number;
  opts: { attempts?: number };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One send attempt (spec §11.3). On failure it writes `mail_send_failed`
 * itself and rethrows so BullMQ schedules the next try; on the final failure
 * it writes `mail_send_abandoned` too and does **not** rethrow — the same
 * catch-and-record-rather-than-hand-to-BullMQ shape as
 * `processExtractionJob`'s own failure path.
 */
export async function processMailJob(
  job: MailJobLike,
  deps: MailWorkerDeps,
): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? new Logger('MailWorker');
  const { data } = job;
  const tryNumber = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? MAIL_MAX_ATTEMPTS;

  try {
    const result = await deps.transport.send({
      to: data.to,
      from: deps.from,
      subject: data.subject,
      html: data.html,
    });
    await writeRequestEvent(deps.db, {
      requestId: data.requestId,
      type: 'mail_sent',
      occurredAt: now(),
      actor: { actorType: 'system' },
      payload: {
        kind: data.kind,
        to: data.to,
        relayResponse: result.relayResponse,
      },
    });
    await deps.mailDeliveries.markSent(data.mailDeliveryId, now());
  } catch (error) {
    const message = errorMessage(error);
    await writeRequestEvent(deps.db, {
      requestId: data.requestId,
      type: 'mail_send_failed',
      occurredAt: now(),
      actor: { actorType: 'system' },
      payload: { tryNumber, relayError: message },
    });

    if (tryNumber >= maxAttempts) {
      await deps.mailDeliveries.markAbandoned(
        data.mailDeliveryId,
        tryNumber,
        message,
        now(),
      );
      await writeRequestEvent(deps.db, {
        requestId: data.requestId,
        type: 'mail_send_abandoned',
        occurredAt: now(),
        actor: { actorType: 'system' },
        payload: {},
      });
      logger.warn(
        `mail ${data.kind} for request ${data.requestId} abandoned after ${tryNumber} tries`,
      );
      return;
    }

    await deps.mailDeliveries.markFailed(
      data.mailDeliveryId,
      tryNumber,
      message,
      now(),
    );
    throw error;
  }
}

export function createMailWorker(deps: MailWorkerDeps): Worker<MailJobData> {
  return new Worker<MailJobData>(
    MAIL_QUEUE_NAME,
    (job: Job<MailJobData>) => processMailJob(job, deps),
    { connection: deps.connection, prefix: deps.prefix },
  );
}
