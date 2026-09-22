import {
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { appConfig, dbConfig, redisConfig } from '../config/namespaces';
import { DB, type Db } from '../db/database.module';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { UpstreamModule } from '../upstream/upstream.module';
import { UpstreamClient } from '../upstream/upstream-client';
import { freeDiskBytes } from './disk-space';
import { EXTRACTION_QUEUE_NAME } from './extraction.config';
import { ExtractionJobs } from './extraction-jobs.repository';
import { ExtractionQueue, type ExtractionJobData } from './extraction-queue';
import { reconcileExtractionJobs } from './extraction-reconcile';
import { createExtractionWorker } from './extraction-worker';
import { createRedisConnection } from './redis-connection';

// A Worker needs a dedicated blocking connection of its own — sharing one
// with the Queue's connection is what left `Worker#close()` hanging forever
// under test. Each gets its own `ioredis` instance.
const QUEUE_REDIS_CONNECTION = Symbol('EXTRACTION_QUEUE_REDIS_CONNECTION');
const WORKER_REDIS_CONNECTION = Symbol('EXTRACTION_WORKER_REDIS_CONNECTION');
const BULLMQ_QUEUE = Symbol('EXTRACTION_BULLMQ_QUEUE');
const BULLMQ_WORKER = Symbol('EXTRACTION_BULLMQ_WORKER');

/**
 * BullMQ's Redis key prefix, namespaced by the application database's own
 * name. In production this is one stable value. In an e2e suite, every test
 * file runs its own app instance against its own throwaway scratch database
 * on a *shared* Redis (`test/support/scratch-database.ts`) — without this,
 * every such instance's Worker would compete for the same 'extraction' queue
 * key space and could pick up and process a job that belongs to a different
 * test file's Postgres.
 */
function bullPrefix(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, '') || 'dds';
}

@Injectable()
class ExtractionLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('ExtractionModule');

  constructor(
    private readonly jobs: ExtractionJobs,
    private readonly queue: ExtractionQueue,
    private readonly worker: Worker<ExtractionJobData>,
    private readonly queueConnection: Redis,
    private readonly workerConnection: Redis,
  ) {}

  async onModuleInit() {
    await reconcileExtractionJobs(this.jobs, this.queue, this.logger);
  }

  async onApplicationShutdown() {
    await this.worker.close();
    await this.queue.close();
    // BullMQ never closes a connection it did not create itself — both of
    // these were injected, not built internally by the Queue/Worker. `quit`,
    // not `disconnect`: it waits for Queue/Worker's own final commands to
    // finish flushing on this connection instead of severing the socket out
    // from under them.
    await Promise.all([
      this.queueConnection.quit().catch(() => undefined),
      this.workerConnection.quit().catch(() => undefined),
    ]);
  }
}

@Module({
  imports: [ReferenceDataModule, UpstreamModule],
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
        new Queue<ExtractionJobData>(EXTRACTION_QUEUE_NAME, {
          connection,
          prefix: bullPrefix(db.url),
        }),
    },
    {
      provide: ExtractionQueue,
      inject: [BULLMQ_QUEUE],
      useFactory: (queue: Queue<ExtractionJobData>) =>
        new ExtractionQueue(queue),
    },
    {
      provide: ExtractionJobs,
      inject: [DB],
      useFactory: (db: Db) => new ExtractionJobs(db),
    },
    {
      provide: BULLMQ_WORKER,
      inject: [
        DB,
        WORKER_REDIS_CONNECTION,
        UpstreamClient,
        ExtractionJobs,
        ProvinceLookup,
        appConfig.KEY,
        dbConfig.KEY,
      ],
      useFactory: (
        db: Db,
        connection: Redis,
        upstream: UpstreamClient,
        extractionJobs: ExtractionJobs,
        provinceLookup: ProvinceLookup,
        app: ConfigType<typeof appConfig>,
        dbCfg: ConfigType<typeof dbConfig>,
      ) =>
        createExtractionWorker({
          db,
          connection,
          upstream,
          extractionJobs,
          provinceLookup,
          scratchDir: app.scratchDir,
          freeDiskBytes,
          prefix: bullPrefix(dbCfg.url),
        }),
    },
    {
      provide: ExtractionLifecycle,
      inject: [
        ExtractionJobs,
        ExtractionQueue,
        BULLMQ_WORKER,
        QUEUE_REDIS_CONNECTION,
        WORKER_REDIS_CONNECTION,
      ],
      useFactory: (
        jobs: ExtractionJobs,
        queue: ExtractionQueue,
        worker: Worker<ExtractionJobData>,
        queueConnection: Redis,
        workerConnection: Redis,
      ) =>
        new ExtractionLifecycle(
          jobs,
          queue,
          worker,
          queueConnection,
          workerConnection,
        ),
    },
  ],
  exports: [ExtractionJobs, ExtractionQueue],
})
export class ExtractionModule {}
