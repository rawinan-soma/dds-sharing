import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { bullPrefix } from '../db/bull-prefix';
import { createRedisConnection } from '../extraction/redis-connection';
import { DB, type Db } from '../db/database.module';
import { dbConfig, redisConfig, smtpConfig } from '../config/namespaces';
import { MailDeliveries } from './mail-delivery.repository';
import { MailSender } from './mail-sender';
import { MAIL_QUEUE_NAME, MailQueue, type MailJobData } from './mail-queue';
import { createMailWorker } from './mail-worker';
import { createSmtpTransport, type MailTransport } from './mail-transport';

// Mirrors `extraction.module.ts`'s shape: its own Redis connections for the
// Queue and the Worker (a Worker needs a dedicated blocking one), a lifecycle
// class that closes both on shutdown.
const QUEUE_REDIS_CONNECTION = Symbol('MAIL_QUEUE_REDIS_CONNECTION');
const WORKER_REDIS_CONNECTION = Symbol('MAIL_WORKER_REDIS_CONNECTION');
const BULLMQ_QUEUE = Symbol('MAIL_BULLMQ_QUEUE');
const BULLMQ_WORKER = Symbol('MAIL_BULLMQ_WORKER');
/** Exported so an e2e spec can override it with a recording fake — nothing in
 * CI sends real mail. */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

@Injectable()
class MailLifecycle implements OnApplicationShutdown {
  constructor(
    private readonly worker: Worker<MailJobData>,
    private readonly queue: Queue<MailJobData>,
    private readonly queueConnection: Redis,
    private readonly workerConnection: Redis,
  ) {}

  async onApplicationShutdown() {
    await this.worker.close();
    await this.queue.close();
    await Promise.all([
      this.queueConnection.quit().catch(() => undefined),
      this.workerConnection.quit().catch(() => undefined),
    ]);
  }
}

@Module({
  providers: [
    {
      provide: QUEUE_REDIS_CONNECTION,
      inject: [redisConfig.KEY],
      useFactory: (redis: ConfigType<typeof redisConfig>) =>
        createRedisConnection(redis.url),
    },
    {
      provide: WORKER_REDIS_CONNECTION,
      inject: [redisConfig.KEY],
      useFactory: (redis: ConfigType<typeof redisConfig>) =>
        createRedisConnection(redis.url),
    },
    {
      provide: BULLMQ_QUEUE,
      inject: [QUEUE_REDIS_CONNECTION, dbConfig.KEY],
      useFactory: (connection: Redis, db: ConfigType<typeof dbConfig>) =>
        new Queue<MailJobData>(MAIL_QUEUE_NAME, {
          connection,
          prefix: bullPrefix(db.url),
        }),
    },
    {
      provide: MailQueue,
      inject: [BULLMQ_QUEUE],
      useFactory: (queue: Queue<MailJobData>) => new MailQueue(queue),
    },
    {
      provide: MailDeliveries,
      inject: [DB],
      useFactory: (db: Db) => new MailDeliveries(db),
    },
    {
      provide: MAIL_TRANSPORT,
      inject: [smtpConfig.KEY],
      useFactory: (smtp: ConfigType<typeof smtpConfig>): MailTransport =>
        createSmtpTransport(smtp),
    },
    {
      provide: BULLMQ_WORKER,
      inject: [
        DB,
        MAIL_TRANSPORT,
        MailDeliveries,
        WORKER_REDIS_CONNECTION,
        smtpConfig.KEY,
        dbConfig.KEY,
      ],
      useFactory: (
        db: Db,
        transport: MailTransport,
        mailDeliveries: MailDeliveries,
        connection: Redis,
        smtp: ConfigType<typeof smtpConfig>,
        dbCfg: ConfigType<typeof dbConfig>,
      ) =>
        createMailWorker({
          db,
          transport,
          mailDeliveries,
          from: smtp.from,
          connection,
          prefix: bullPrefix(dbCfg.url),
        }),
    },
    {
      provide: MailLifecycle,
      inject: [
        BULLMQ_WORKER,
        BULLMQ_QUEUE,
        QUEUE_REDIS_CONNECTION,
        WORKER_REDIS_CONNECTION,
      ],
      useFactory: (
        worker: Worker<MailJobData>,
        queue: Queue<MailJobData>,
        queueConnection: Redis,
        workerConnection: Redis,
      ) => new MailLifecycle(worker, queue, queueConnection, workerConnection),
    },
    MailSender,
  ],
  exports: [MailSender, MailQueue, MailDeliveries],
})
export class MailModule {}
