import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import redisConfig from "../config/redis.config.js";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import { province, request, requestContact, requestEvent } from "../db/schema.js";
import type {
  CodeFetchedPayload,
  ExtractionAlertRaisedPayload,
  JobCompletedPayload,
  JobDeferredLowDiskPayload,
  JobFailedPayload,
  JobStartedPayload,
  MailSentPayload,
  MailSendFailedPayload,
} from "../db/events.js";
import { UPSTREAM_CLIENT } from "../upstream/upstream.module.js";
import type { UpstreamClient } from "../upstream/upstream-client.js";
import { buildExtractionFailureEmail } from "../mail/extraction-failure-email.js";
import { MailService } from "../mail/mail.service.js";
import { m } from "../paraglide/messages.js";
import { buildArchiveNames } from "./archive-filename.js";
import { getDataDictionaryBytes, computeDataDictionaryChecksum, DATA_DICTIONARY_FILENAME } from "./data-dictionary.js";
import { checkFreeDisk, MIN_FREE_DISK_BYTES } from "./disk-space.js";
import { buildProvinceLookup } from "./epidem-health-zone.js";
import { buildExtractArchive } from "./extract-archive.js";
import { writeExtractCsv } from "./extract-writer.js";
import { ExtractionRunner, type ExtractionRunResult } from "./extraction-runner.js";
import type { ExtractionJobPayload } from "./extraction-queue.service.js";
import { classifyExtractionFailure } from "./job-failure.js";
import { ObjectStorageService } from "./object-storage.service.js";
import { latestProbeEvent } from "../probe/latest-probe-event.js";
import { computeProvinceChecksum, type ProvinceRow } from "../reference-data/province-integrity.js";
import { EXTRACTION_CONCURRENCY, EXTRACTION_QUEUE_NAME } from "./queue-constants.js";
import { createExtractionRedisConnection } from "./redis-connection.js";
import { SCRATCH_ROOT, ScratchStore } from "./scratch-store.js";

/**
 * The consumer side of §7.7's queue. One Nest process runs both the HTTP
 * app and this Worker — there is no separate worker entrypoint — so
 * `EXTRACTION_CONCURRENCY` (§13.2) is the process-wide ceiling on how many
 * extraction jobs run at once, enforced by BullMQ's own `concurrency`
 * option rather than by any queue-admission logic of this codebase's own.
 */
@Injectable()
export class ExtractionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionProcessor.name);
  private worker?: Worker<ExtractionJobPayload>;
  // Stateless filesystem wrapper (spec §7.6, §7.8) — one instance shared by
  // both the run stage (checkpointing) and the completion stage (clearing
  // scratch after a successful upload).
  private readonly scratchStore = new ScratchStore();

  constructor(
    @Inject(APP_DB) private readonly appDb: AppDb,
    @Inject(UPSTREAM_CLIENT) private readonly upstreamClient: UpstreamClient,
    @Inject(redisConfig.KEY) private readonly redis: ConfigType<typeof redisConfig>,
    private readonly mailService: MailService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<ExtractionJobPayload>(
      EXTRACTION_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: createExtractionRedisConnection(this.redis.url),
        concurrency: EXTRACTION_CONCURRENCY,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Job<ExtractionJobPayload>): Promise<void> {
    const { requestId } = job.data;
    const { db } = this.appDb;

    // §7.8: a floor, checked once per attempt, before anything else. Below
    // it, defer (a plain throw — BullMQ's own backoff retries this job)
    // rather than start and die at the write step later.
    const disk = await checkFreeDisk(SCRATCH_ROOT);
    if (disk.belowFloor) {
      await db.insert(requestEvent).values({
        requestId,
        type: "job_deferred_low_disk",
        actorType: "system",
        payload: {
          freeBytes: disk.freeBytes,
          floorBytes: MIN_FREE_DISK_BYTES,
        } satisfies JobDeferredLowDiskPayload,
        occurredAt: new Date(),
      });
      throw new Error("extraction job deferred: free disk below floor");
    }

    const attempt = (job.attemptsMade ?? 0) + 1;
    await db.insert(requestEvent).values({
      requestId,
      type: "job_started",
      actorType: "system",
      payload: { attempt } satisfies JobStartedPayload,
      occurredAt: new Date(),
    });
    await db
      .update(request)
      .set({ state: "running" })
      .where(eq(request.id, requestId));

    try {
      const runTotalsByCode = new Map<string, number>();
      const { result, submittedAt, provinceRows } = await this.runPipeline(
        requestId,
        runTotalsByCode,
      );
      // The three data-quality signals rule 1/§6.3 name are raised as soon
      // as they're known, ahead of the write/upload stage below — nothing
      // about them waits on it.
      await this.raiseDataQualityAlerts(requestId, result);
      await this.completeJob(requestId, submittedAt, result, runTotalsByCode, provinceRows);
    } catch (error) {
      const failure = classifyExtractionFailure(error);
      // Counts, the Request id and a classified cause only (§14.5) — never
      // the underlying error's own message/stack, which could carry a
      // response fragment on an unanticipated failure shape.
      this.logger.warn(
        `extraction job failed for request ${requestId}: ${failure.failureCause}`,
      );
      await db.insert(requestEvent).values({
        requestId,
        type: "job_failed",
        actorType: "system",
        payload: {
          cause: failure.failureCause,
          xRequestId: failure.xRequestId,
        } satisfies JobFailedPayload,
        occurredAt: new Date(),
      });
      await db
        .update(request)
        .set({ state: "failed" })
        .where(eq(request.id, requestId));

      await this.sendFailureEmail(requestId);

      // Every failure this job can classify is terminal on its own terms
      // (§7.6's own 3-attempts-per-code retry has already run inside
      // UpstreamClient by the time anything reaches here) — never a BullMQ
      // retry, which exists solely for the low-disk deferral above.
      throw new UnrecoverableError(failure.message);
    }
  }

  /**
   * §14.3: "The Requester is emailed on failure and sees one
   * undifferentiated failure." One try, one event — same reasoning as
   * `ReviewerQueueService`'s rejection email: the retry-and-Alert
   * machinery (§11.3) is the scheduled tick's job (#72), not this one's.
   */
  private async sendFailureEmail(requestId: string): Promise<void> {
    const { db } = this.appDb;
    const [row] = await db
      .select({
        email: requestContact.email,
        referenceNumber: request.referenceNumber,
      })
      .from(requestContact)
      .innerJoin(request, eq(request.id, requestContact.requestId))
      .where(eq(requestContact.requestId, requestId));
    if (!row) return; // defensive only — never observed (§10.3: request_contact is written with request, in the same transaction)

    const email = buildExtractionFailureEmail({
      referenceNumber: row.referenceNumber,
      telephone: m.requester_service_telephone(),
    });
    const sendResult = await this.mailService.send({
      to: row.email,
      subject: email.subject,
      text: email.text,
    });

    await db.insert(requestEvent).values(
      sendResult.outcome === "sent"
        ? {
            requestId,
            type: "mail_sent",
            actorType: "system",
            payload: {
              kind: "extraction_failure",
              to: row.email,
              relayResponse: sendResult.relayResponse,
            } satisfies MailSentPayload,
            occurredAt: new Date(),
          }
        : {
            requestId,
            type: "mail_send_failed",
            actorType: "system",
            payload: {
              tryNumber: 1,
              relayError: sendResult.error,
            } satisfies MailSendFailedPayload,
            occurredAt: new Date(),
          },
    );
  }

  private async runPipeline(
    requestId: string,
    runTotalsByCode: Map<string, number>,
  ): Promise<{
    result: ExtractionRunResult;
    submittedAt: Date;
    provinceRows: ProvinceRow[];
  }> {
    const { db } = this.appDb;

    const [row] = await db
      .select({
        reportCodes: request.reportCodes,
        fromDate: request.fromDate,
        toDate: request.toDate,
        areaProvinces: request.areaProvinces,
        submittedAt: request.submittedAt,
      })
      .from(request)
      .where(eq(request.id, requestId));
    if (!row) {
      throw new UnrecoverableError(`request ${requestId} not found`);
    }

    // Read once, held for the whole job (§6.4) — never a per-row join. The
    // same rows are reused for the province checksum on `job_completed`
    // (§7.9, §8.4), rather than re-querying a table that must not have
    // changed mid-job anyway.
    const provinceRows = await db.select().from(province);
    const provinces = buildProvinceLookup(provinceRows);

    const runner = new ExtractionRunner(
      this.upstreamClient,
      this.scratchStore,
      provinces,
    );

    const result = await runner.run(
      {
        requestId,
        reportCodes: row.reportCodes,
        fromDate: row.fromDate,
        toDate: row.toDate,
        areaProvinces: row.areaProvinces,
      },
      {
        onCodeFetched: async (event) => {
          runTotalsByCode.set(event.groupCode, event.totalItems);
          await db.insert(requestEvent).values({
            requestId,
            type: "code_fetched",
            actorType: "system",
            payload: event satisfies CodeFetchedPayload,
            occurredAt: new Date(),
          });
        },
      },
    );

    return { result, submittedAt: row.submittedAt, provinceRows };
  }

  /**
   * The Probe's own per-code totals (spec §5.4) — `null` when the Probe
   * never completed, so the drift comparison can say *"pending"* honestly
   * rather than guessing zero.
   */
  private async probeTotalsByCode(requestId: string): Promise<Map<string, number> | null> {
    const event = await latestProbeEvent(this.appDb.db, requestId);
    if (!event || event.type === "probe_failed") return null;
    return new Map(event.payload.codes.map((code) => [code.groupCode, code.totalItems]));
  }

  /**
   * Write → zip → fingerprint → upload → record (FR-17, spec §7.9 steps
   * 6-9, §8.1-§8.4). Delivering the result to the Requester (the Download
   * token, the Delivery email — FR-18, FR-21) is the next slice (#70's own
   * scope note); this ticket's job ends the moment the archive is
   * recorded and the Request is `ready`.
   */
  private async completeJob(
    requestId: string,
    submittedAt: Date,
    result: ExtractionRunResult,
    runTotalsByCode: Map<string, number>,
    provinceRows: ProvinceRow[],
  ): Promise<void> {
    const { db } = this.appDb;

    const writeResult = writeExtractCsv(result.rows);
    // spec §7.9 step 6: the final CSV's line count must equal the sum of
    // per-code rows written — cheap, and the only thing standing between a
    // silently truncated write and a CSV that looks complete.
    if (writeResult.rowCount !== result.rows.length) {
      throw new Error(
        `Extract writer row count mismatch for request ${requestId}: ` +
          `wrote ${writeResult.rowCount}, expected ${result.rows.length}`,
      );
    }

    const dataDictionary = getDataDictionaryBytes();
    // runNumber is always 1 here — a Re-run (FR-26, #74) is the only thing
    // that will ever pass higher, and it does not exist yet.
    const { archiveFilename, csvFilename } = buildArchiveNames(submittedAt, 1);
    const archive = await buildExtractArchive([
      { name: csvFilename, data: writeResult.csv },
      { name: DATA_DICTIONARY_FILENAME, data: dataDictionary },
    ]);

    // spec §7.9 step 7: one upload operation, so "an object exists in the
    // bucket" means exactly "a complete, publishable Extract archive."
    await this.objectStorage.uploadArchive(archiveFilename, archive);

    // spec §7.9 step 8: scratch is deleted only after a successful upload —
    // exactly one copy of the rows exists after completion.
    await this.scratchStore.clear(requestId);

    const probeTotals = await this.probeTotalsByCode(requestId);
    const probeVsRunDrift = [...runTotalsByCode.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([groupCode, runTotal]) => ({
        groupCode,
        probeTotal: probeTotals?.get(groupCode) ?? null,
        runTotal,
      }));

    await db.insert(requestEvent).values({
      requestId,
      type: "job_completed",
      actorType: "system",
      payload: {
        fingerprint: {
          rowCount: writeResult.rowCount,
          columnCount: writeResult.columnCount,
          csvBytes: writeResult.csv.length,
          zipBytes: archive.length,
          csvSha256: writeResult.sha256,
        },
        referenceData: {
          provincesChecksum: computeProvinceChecksum(provinceRows),
          dataDictionaryChecksum: computeDataDictionaryChecksum(dataDictionary),
        },
        archiveFilename,
        impossibleDerivationInputs: result.counters.impossibleDerivationInputs,
        probeVsRunDrift,
      } satisfies JobCompletedPayload,
      occurredAt: new Date(),
    });

    await db.update(request).set({ state: "ready" }).where(eq(request.id, requestId));
  }

  /**
   * Rule 1 (§6.1) names two alerts and §6.3 names a third and a fourth —
   * each is its own `extraction_alert_raised` event, raised only when its
   * count is non-zero, never for an absent field on its own (§6.1: "An
   * absent field is normal and must never alert").
   *
   * `impossibleDerivationInputs` also reaches the record this way, ahead of
   * `job_completed` (§70's job): the count must reach the record the moment
   * it is known, not wait on a later ticket's payload to carry it.
   */
  private async raiseDataQualityAlerts(
    requestId: string,
    result: ExtractionRunResult,
  ): Promise<void> {
    const { db } = this.appDb;
    const now = new Date();

    if (result.absentEpidemChwCodeCount > 0) {
      await db.insert(requestEvent).values({
        requestId,
        type: "extraction_alert_raised",
        actorType: "system",
        payload: {
          reason: `${result.absentEpidemChwCodeCount} row(s) had no epidem_chw_code`,
        } satisfies ExtractionAlertRaisedPayload,
        occurredAt: now,
      });
    }

    if (result.counters.unknownFieldNames.size > 0) {
      await db.insert(requestEvent).values({
        requestId,
        type: "extraction_alert_raised",
        actorType: "system",
        payload: {
          reason: `unknown upstream field name(s): ${[...result.counters.unknownFieldNames].sort().join(", ")}`,
        } satisfies ExtractionAlertRaisedPayload,
        occurredAt: now,
      });
    }

    if (result.counters.unmappedHealthZoneCount > 0) {
      await db.insert(requestEvent).values({
        requestId,
        type: "extraction_alert_raised",
        actorType: "system",
        payload: {
          reason: `${result.counters.unmappedHealthZoneCount} row(s) had an epidem_chw_code outside the province table — it may be stale`,
        } satisfies ExtractionAlertRaisedPayload,
        occurredAt: now,
      });
    }

    if (result.counters.impossibleDerivationInputs > 0) {
      await db.insert(requestEvent).values({
        requestId,
        type: "extraction_alert_raised",
        actorType: "system",
        payload: {
          reason: `${result.counters.impossibleDerivationInputs} impossible onset_age derivation input(s)`,
        } satisfies ExtractionAlertRaisedPayload,
        occurredAt: now,
      });
    }
  }
}
