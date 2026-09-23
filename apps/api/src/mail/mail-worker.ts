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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One send attempt (spec §11.3). The try number is Postgres's, not BullMQ's:
 * retries are scheduled by the tick, which re-queues this same job out of the
 * failed set (`MailQueue.retry`), so BullMQ's own counter says nothing about
 * how many tries the record holds. On failure it writes `mail_send_failed`
 * itself and rethrows, leaving the job — and the rendered message only it
 * holds — in BullMQ's failed set for the tick; on the final failure it writes
 * `mail_send_abandoned` too and does **not** rethrow.
 */
export async function processMailJob(
  job: MailJobLike,
  deps: MailWorkerDeps,
): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? new Logger('MailWorker');
  const { data } = job;
  const tryNumber =
    (await deps.mailDeliveries.attempts(data.mailDeliveryId)) + 1;

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

    if (tryNumber >= MAIL_MAX_ATTEMPTS) {
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
