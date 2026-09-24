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
import { request, requestContact, requestEvent, reviewer } from '../db/schema';
import { generateToken } from '../delivery/token';
import { type DownloadTokens } from '../delivery/download-tokens.repository';
import { type MailSender } from '../mail/mail-sender';
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
import {
  ExtractionJobs,
  type FailedJobResult,
} from './extraction-jobs.repository';
import {
  ExtractionFailure,
  runExtraction,
  type ExtractionResult,
  type ExtractionSummary,
  type ExtractionTarget,
  type UpstreamPager,
} from './extraction-pipeline';
import { raiseExtractionAlert } from '../reviewer/alert-records';
import { StallError, StallGuard } from './stall-guard';

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
  /** Issues the Download token at completion (spec §9.3). */
  downloadTokens: DownloadTokens;
  /** Sends the Delivery email on completion and the extraction-failure email on failure (spec §11). */
  mailSender: MailSender;
  /** The Download token's absolute base URL — explicit configuration, never derived from `Host` (spec §9.1). */
  frontendUrl: string;
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
  /** For the Delivery/extraction-failure emails — rides along for the same reason. */
  reference: string;
}

/** The Request's stored parameters — read fresh per job, never cached
 * outside it: a Re-run must see whatever is stored now. */
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
      reference: request.reference,
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
  runNumber: number,
  now: () => Date,
): Promise<{ archiveFilename: string }> {
  const archive = await buildExtractArchive({
    rowsByCode: result.rowsByCode,
    codes: result.summary.reportCodes,
    submittedAt: target.submittedAt,
    runNumber,
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

  return { archiveFilename: archive.archiveFilename };
}

/**
 * The Extract is ready: issues its Download token and sends the Delivery
 * (spec §9.3, §11.3). The token is generated here, at completion — never
 * earlier — because it is anchored on job completion, not on approval. For a
 * Re-run, `issueAtReady` also revokes the earlier token in the same breath
 * (ADR 0012), before the Delivery goes, so a resend can never pick up a
 * superseded link.
 *
 * A Request that ended while the job ran gets no token and no Delivery
 * (ADR 0016): the object just uploaded is removed at once, on the record,
 * rather than left for the lifecycle backstop.
 */
async function deliver(
  deps: Pick<
    ExtractionWorkerDeps,
    'db' | 'downloadTokens' | 'mailSender' | 'frontendUrl' | 'archiveStore'
  >,
  requestId: string,
  reference: string,
  archiveFilename: string,
  now: () => Date,
  logger: LoggerService,
): Promise<void> {
  const rawToken = generateToken();
  const token = await deps.downloadTokens.issueAtReady(
    requestId,
    rawToken,
    archiveFilename,
    now(),
  );
  if (!token) {
    logger.warn(
      `extraction for request ${requestId} finished after the request ended; nothing delivered`,
    );
    await deps.archiveStore.remove(archiveFilename);
    await writeRequestEvent(deps.db, {
      requestId,
      type: 'object_deleted',
      occurredAt: now(),
      actor: { actorType: 'system' },
      payload: { objectKey: archiveFilename, outcome: 'deleted' },
    });
    return;
  }

  const [contact] = await deps.db
    .select({
      name: requestContact.name,
      surname: requestContact.surname,
      email: requestContact.email,
    })
    .from(requestContact)
    .where(eq(requestContact.requestId, requestId));
  await deps.mailSender.send(
    requestId,
    contact.email,
    {
      kind: 'delivery',
      name: `${contact.name} ${contact.surname}`,
      reference,
      downloadUrl: `${deps.frontendUrl}/d/${rawToken}`,
    },
    { downloadTokenId: token.id },
  );
}

/**
 * Sends the extraction-failure email to the Reviewer who approved the Request
 * (spec §11.3) — the "not your fault" notice, since a Reviewer cannot fix a
 * failed extraction. Silently does nothing if no approving Reviewer is on
 * record, which cannot happen on the ordinary path (a job never runs without
 * an `approved` event) but must not crash the worker if it somehow did.
 */
async function sendExtractionFailureMail(
  deps: Pick<ExtractionWorkerDeps, 'db' | 'mailSender'>,
  requestId: string,
  reference: string,
): Promise<void> {
  const [approval] = await deps.db
    .select({ reviewerId: requestEvent.reviewerId })
    .from(requestEvent)
    .where(
      and(
        eq(requestEvent.requestId, requestId),
        eq(requestEvent.type, 'approved'),
      ),
    );
  if (!approval?.reviewerId) return;

  const [approver] = await deps.db
    .select({ email: reviewer.email, displayName: reviewer.displayName })
    .from(reviewer)
    .where(eq(reviewer.id, approval.reviewerId));
  if (!approver) return;

  await deps.mailSender.send(requestId, approver.email, {
    kind: 'extraction_failure',
    name: approver.displayName,
    reference,
  });
}

function toFailure(
  error: unknown,
  provincesChecksum: string,
): {
  cause: JobFailureCause;
  xRequestId: string | null;
  result: FailedJobResult | null;
} {
  if (error instanceof ExtractionFailure) {
    return {
      cause: error.cause,
      xRequestId: error.xRequestId,
      result: error.unrecognisedProvinceCode
        ? { unrecognisedProvinceCode: { provincesChecksum } }
        : null,
    };
  }
  if (error instanceof StallError) {
    return { cause: 'stall', xRequestId: null, result: null };
  }
  return { cause: 'internal', xRequestId: null, result: null };
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
  const runNumber = await deps.extractionJobs.runNumber(jobId);
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
  let published: string | null = null;
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
    const { archiveFilename } = await publishExtract(
      deps,
      requestId,
      target,
      result,
      runNumber,
      now,
    );
    await deps.extractionJobs.markSucceeded(jobId, now(), result.summary);
    published = archiveFilename;
  } catch (error) {
    const failure = toFailure(error, deps.provinceLookup.checksum);
    logger.warn(
      `extraction job ${jobId} failed cause=${failure.cause}` +
        (failure.xRequestId ? ` request_id=${failure.xRequestId}` : ''),
    );
    await deps.extractionJobs.markFailed(
      jobId,
      now(),
      failure.cause,
      failure.result,
    );
    await writeRequestEvent(deps.db, {
      requestId,
      type: 'job_failed',
      occurredAt: now(),
      actor: { actorType: 'system' },
      payload: { cause: failure.cause, xRequestId: failure.xRequestId },
    });
    // The second watcher (§14.2): the operator reads the fault on /health;
    // the approving Reviewer gets the broken promise as a must-clear Alert.
    await raiseExtractionAlert(deps.db, requestId, now());
    await sendExtractionFailureMail(deps, requestId, target.reference);
  } finally {
    stallGuard.dispose();
  }

  // Outside the failure path on purpose: the Extract is published and the job
  // succeeded, so nothing after this point is an extraction failure. A send
  // that goes wrong is the Delivery's own (§11.3: retried, then an Alert); a
  // Request left ready with no link reads so on the in-flight list, where a
  // Re-run is offered.
  if (published) {
    await deliver(deps, requestId, target.reference, published, now, logger);
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
