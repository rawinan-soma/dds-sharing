import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger, type LoggerService } from '@nestjs/common';
import { DelayedError, type Job, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { and, eq } from 'drizzle-orm';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { writeRequestEvent } from '../audit/write-request-event';
import {
  type JobFailureCause,
  type RequestEventPayloads,
} from '../audit/event-catalogue';
import { request, requestEvent } from '../db/schema';
import { type ProvinceLookup } from '../reference/province-lookup.service';
import { type ArchiveStore } from './archive-store';
import { buildExtractArchive } from './build-extract-archive';
import { DATA_DICTIONARY_CHECKSUM } from './data-dictionary';
import {
  DISK_FLOOR_BYTES,
  DISK_RECHECK_DELAY_MS,
  EXTRACTION_CONCURRENCY,
  EXTRACTION_DEFAULTS,
  EXTRACTION_QUEUE_NAME,
} from './extraction.config';
import { type ExtractionJobData } from './extraction-queue';
import { ExtractionJobs } from './extraction-jobs.repository';
import {
  ExtractionFailure,
  runExtraction,
  type ExtractionResult,
  type ExtractionSummary,
  type ExtractionTarget,
  type UpstreamPager,
} from './extraction-pipeline';
import { StallError, StallGuard } from './stall-guard';

// A Re-run (#74) will pass a run number above 1, which is what earns an
// archive its `-rN` suffix (spec §8.3). Nothing produces one yet.
const FIRST_RUN = 1;

export interface ExtractionWorkerDeps {
  db: NodePgDatabase;
  connection: Redis;
  upstream: UpstreamPager;
  extractionJobs: ExtractionJobs;
  /** Held by the app since boot (spec §6.4); each job builds its own lookup
   * from it once, at job start, per spec §6.4's consistency rule. */
  provinceLookup: ProvinceLookup;
  scratchDir: string;
  freeDiskBytes: (path: string) => Promise<number>;
  /** Where the finished archive uploads in one operation (spec §7.8). */
  archiveStore: ArchiveStore;
  /** BullMQ's Redis key prefix — see `extraction.module.ts` for why. */
  prefix?: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  logger?: LoggerService;
  /** Overrides `EXTRACTION_DEFAULTS.stallMs` — a spec does not wait 2 minutes. */
  stallMs?: number;
}

/** What the processor needs from a BullMQ `Job` — narrowed for testability. */
export interface ExtractionJobLike {
  id?: string;
  data: ExtractionJobData;
  moveToDelayed(timestamp: number, token?: string): Promise<void>;
}

interface ExtractionTargetWithSubmittedAt extends ExtractionTarget {
  /** The archive filename's anchor (spec §8.3) — irrelevant to the pipeline
   * itself, so it rides along on the same row rather than a second query. */
  submittedAt: Date;
}

/** The Request's stored parameters — read fresh per job, never cached
 * outside it: a Re-run (a later ticket) must see whatever is stored now. */
async function loadTarget(
  db: NodePgDatabase,
  requestId: string,
): Promise<ExtractionTargetWithSubmittedAt> {
  const [row] = await db
    .select({
      reportCodes: request.reportCodes,
      startDate: request.startDate,
      endDate: request.endDate,
      provinces: request.provinces,
      submittedAt: request.submittedAt,
    })
    .from(request)
    .where(eq(request.id, requestId));
  if (!row) {
    throw new Error(`extraction job: request ${requestId} does not exist`);
  }
  return { requestId, ...row };
}

/**
 * The Probe's per-code totals, for `job_completed`'s drift group — recorded,
 * never asserted (spec §5.4, §12.4). `probe_performed`/`probe_failed` is terminal
 * and written at most once per Request, so the first match settles it; a
 * Probe that never landed or that failed reports no totals, `{}`.
 */
async function loadProbeTotals(
  db: NodePgDatabase,
  requestId: string,
): Promise<Record<string, number>> {
  const [row] = await db
    .select({ payload: requestEvent.payload })
    .from(requestEvent)
    .where(
      and(
        eq(requestEvent.requestId, requestId),
        eq(requestEvent.type, 'probe_performed'),
      ),
    );
  if (!row) return {};
  return (row.payload as RequestEventPayloads['probe_performed'])
    .totalItemsByCode;
}

/**
 * Storage during the job (spec §7.8): the finished archive is written to
 * scratch, uploaded to MinIO in one operation, then scratch is deleted — so
 * "an object exists in the bucket" means exactly "a complete, publishable
 * Extract". Writes `job_completed` last, once the archive is actually
 * published, so the event never describes an upload that did not happen.
 */
async function publishExtract(
  deps: Pick<
    ExtractionWorkerDeps,
    'db' | 'scratchDir' | 'archiveStore' | 'provinceLookup'
  >,
  requestId: string,
  target: ExtractionTargetWithSubmittedAt,
  result: ExtractionResult,
  now: () => Date,
): Promise<void> {
  const archive = await buildExtractArchive({
    rowsByCode: result.rowsByCode,
    codes: result.summary.reportCodes,
    submittedAt: target.submittedAt,
    runNumber: FIRST_RUN,
  });
  const scratchPath = join(deps.scratchDir, archive.archiveFilename);
  await writeFile(scratchPath, archive.archiveBytes);
  await deps.archiveStore.upload(archive.archiveFilename, archive.archiveBytes);
  await unlink(scratchPath);

  const probeTotals = await loadProbeTotals(deps.db, requestId);
  await writeRequestEvent(deps.db, {
    requestId,
    type: 'job_completed',
    occurredAt: now(),
    actor: { actorType: 'system' },
    payload: {
      rowCount: archive.rowCount,
      columnCount: archive.columnCount,
      csvBytes: archive.csvBytes,
      zipBytes: archive.archiveBytes.length,
      csvSha256: archive.csvSha256,
      provincesChecksum: deps.provinceLookup.checksum,
      dataDictionaryChecksum: DATA_DICTIONARY_CHECKSUM,
      archiveFilename: archive.archiveFilename,
      impossibleDerivationInputs: result.summary.impossibleDerivationInputs,
      drift: { probe: probeTotals, run: result.summary.totalItemsByCode },
    },
  });
}

function toFailure(error: unknown): {
  cause: JobFailureCause;
  xRequestId: string | null;
} {
  if (error instanceof ExtractionFailure) {
    return { cause: error.cause, xRequestId: error.xRequestId };
  }
  if (error instanceof StallError) return { cause: 'stall', xRequestId: null };
  return { cause: 'internal', xRequestId: null };
}

/**
 * Rule 1's operational alert (spec §6.1, §7.4) and §4.4's missing-code alert:
 * both are logged here, once per job, rather than per row — a job can hold
 * thousands of rows and the count is the useful signal, not the repetition.
 * Neither ever fails the job; they exist so "this cannot happen" is
 * instrumented rather than assumed.
 */
function raiseOperationalAlerts(
  logger: LoggerService,
  jobId: string,
  summary: ExtractionSummary,
): void {
  if (summary.missingEpidemChwCode > 0) {
    logger.warn(
      `extraction job ${jobId}: ${summary.missingEpidemChwCode} row(s) had no epidem_chw_code`,
    );
  }
  if (summary.unknownFieldNames.length > 0) {
    logger.warn(
      `extraction job ${jobId}: unknown upstream field name(s): ${summary.unknownFieldNames.join(', ')}`,
    );
  }
}

/**
 * The job's own body, independent of BullMQ's `Job` type — a plain function
 * over a narrow `job` shape and explicit deps, so it can run against a stub
 * in a test without a real Redis or Postgres.
 */
export async function processExtractionJob(
  job: ExtractionJobLike,
  token: string | undefined,
  deps: ExtractionWorkerDeps,
): Promise<void> {
  const logger = deps.logger ?? new Logger('ExtractionWorker');
  const now = deps.now ?? (() => new Date());
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const jobId = job.id;
  if (!jobId) throw new Error('extraction job has no id');
  const { requestId } = job.data;

  // A job refuses to start below the fixed disk floor (spec §7.8): wait
  // loudly rather than run and die at the upload step. Checked before any
  // Postgres state change, so a deferred job leaves no `running` row behind
  // for the reconcile to misread.
  const free = await deps.freeDiskBytes(deps.scratchDir);
  if (free < DISK_FLOOR_BYTES) {
    await writeRequestEvent(deps.db, {
      requestId,
      type: 'job_deferred_low_disk',
      occurredAt: now(),
      actor: { actorType: 'system' },
      payload: { freeBytes: free, floorBytes: DISK_FLOOR_BYTES },
    });
    await job.moveToDelayed(Date.now() + DISK_RECHECK_DELAY_MS, token);
    throw new DelayedError();
  }

  const target = await loadTarget(deps.db, requestId);
  await deps.extractionJobs.markRunning(jobId, now());
  await writeRequestEvent(deps.db, {
    requestId,
    type: 'job_started',
    occurredAt: now(),
    actor: { actorType: 'system' },
    payload: {},
  });

  const stallGuard = new StallGuard(
    deps.stallMs ?? EXTRACTION_DEFAULTS.stallMs,
  );
  try {
    // Read once, here, and held for the rest of this job (spec §6.4): a
    // per-row join would let a mid-job edit put two regions for one
    // province inside one Extract.
    const provinces = new Map(
      deps.provinceLookup.provinces.map((p) => [p.provinceId, p.healthRegion]),
    );
    const pipeline = runExtraction(target, {
      upstream: deps.upstream,
      provinces,
      now,
      sleep,
      onCodeFetched: async (payload) => {
        await writeRequestEvent(deps.db, {
          requestId,
          type: 'code_fetched',
          occurredAt: now(),
          actor: { actorType: 'system' },
          payload,
        });
        await deps.extractionJobs.touch(jobId, now());
      },
      touch: () => stallGuard.touch(),
    });
    // The loser of the race below keeps running in the background (there is
    // nothing here to cancel it with); this stops an eventual rejection from
    // it surfacing as an unhandled rejection.
    pipeline.catch(() => undefined);

    const result = await Promise.race([pipeline, stallGuard.promise]);
    raiseOperationalAlerts(logger, jobId, result.summary);
    await publishExtract(deps, requestId, target, result, now);
    await deps.extractionJobs.markSucceeded(jobId, now(), result.summary);
  } catch (error) {
    const failure = toFailure(error);
    logger.warn(
      `extraction job ${jobId} failed cause=${failure.cause}` +
        (failure.xRequestId ? ` request_id=${failure.xRequestId}` : ''),
    );
    await deps.extractionJobs.markFailed(jobId, now(), failure.cause, null);
    await writeRequestEvent(deps.db, {
      requestId,
      type: 'job_failed',
      occurredAt: now(),
      actor: { actorType: 'system' },
      payload: { cause: failure.cause, xRequestId: failure.xRequestId },
    });
  } finally {
    stallGuard.dispose();
  }
}

export function createExtractionWorker(
  deps: ExtractionWorkerDeps,
): Worker<ExtractionJobData> {
  return new Worker<ExtractionJobData>(
    EXTRACTION_QUEUE_NAME,
    (job: Job<ExtractionJobData>, token?: string) =>
      processExtractionJob(job, token, deps),
    {
      connection: deps.connection,
      concurrency: EXTRACTION_CONCURRENCY,
      prefix: deps.prefix,
    },
  );
}
