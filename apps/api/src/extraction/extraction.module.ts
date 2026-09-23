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
import {
  appConfig,
  dbConfig,
  minioConfig,
  redisConfig,
} from '../config/namespaces';
import { bullPrefix } from '../db/bull-prefix';
import { DB, type Db } from '../db/database.module';
import { DownloadTokens } from '../delivery/download-tokens.repository';
import { DownloadTokensModule } from '../delivery/download-tokens.module';
import { MailModule } from '../mail/mail.module';
import { MailSender } from '../mail/mail-sender';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { UpstreamModule } from '../upstream/upstream.module';
import { UpstreamClient } from '../upstream/upstream-client';
import {
  type ArchiveStore,
  createMinioArchiveStore,
  createMinioClient,
} from './archive-store';
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
/** Exported so an e2e spec can override it with an in-memory fake — nothing
 * in CI runs a real MinIO (spec §7.8's upload is exercised at the unit layer
 * instead, in `extraction-worker.spec.ts`). */
export const ARCHIVE_STORE = Symbol('EXTRACTION_ARCHIVE_STORE');

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
  imports: [
    ReferenceDataModule,
    UpstreamModule,
    MailModule,
    DownloadTokensModule,
  ],
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
      provide: ARCHIVE_STORE,
      inject: [minioConfig.KEY],
      useFactory: (minio: ConfigType<typeof minioConfig>): ArchiveStore =>
        createMinioArchiveStore(createMinioClient(minio), minio.bucket),
    },
    {
      provide: BULLMQ_WORKER,
      inject: [
        DB,
        WORKER_REDIS_CONNECTION,
        UpstreamClient,
        ExtractionJobs,
        ProvinceLookup,
        ARCHIVE_STORE,
        DownloadTokens,
        MailSender,
        appConfig.KEY,
        dbConfig.KEY,
      ],
      useFactory: (
        db: Db,
        connection: Redis,
        upstream: UpstreamClient,
        extractionJobs: ExtractionJobs,
        provinceLookup: ProvinceLookup,
        archiveStore: ArchiveStore,
        downloadTokens: DownloadTokens,
        mailSender: MailSender,
        app: ConfigType<typeof appConfig>,
        dbCfg: ConfigType<typeof dbConfig>,
      ) =>
        createExtractionWorker({
          db,
          connection,
          upstream,
          extractionJobs,
          provinceLookup,
          archiveStore,
          downloadTokens,
          mailSender,
          frontendUrl: app.frontendUrl,
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
  exports: [ExtractionJobs, ExtractionQueue, ARCHIVE_STORE],
})
export class ExtractionModule {}
