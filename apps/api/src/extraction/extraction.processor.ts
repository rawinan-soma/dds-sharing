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
import { checkFreeDisk, MIN_FREE_DISK_BYTES } from "./disk-space.js";
import { buildProvinceLookup } from "./epidem-health-zone.js";
import { ExtractionRunner, type ExtractionRunResult } from "./extraction-runner.js";
import type { ExtractionJobPayload } from "./extraction-queue.service.js";
import { classifyExtractionFailure } from "./job-failure.js";
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

  constructor(
    @Inject(APP_DB) private readonly appDb: AppDb,
    @Inject(UPSTREAM_CLIENT) private readonly upstreamClient: UpstreamClient,
    @Inject(redisConfig.KEY) private readonly redis: ConfigType<typeof redisConfig>,
    private readonly mailService: MailService,
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
      const result = await this.runPipeline(requestId);
      // Success: the fetched, filtered, projected rows sit in memory only.
      // Writing the CSV, zipping it and uploading it is the next slice
      // (#70) — this ticket's job is done once every code has landed
      // cleanly. The three data-quality signals rule 1/§6.3 name still get
      // raised now, since nothing about them waits on the write stage.
      await this.raiseDataQualityAlerts(requestId, result);
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

  private async runPipeline(requestId: string): Promise<ExtractionRunResult> {
    const { db } = this.appDb;

    const [row] = await db
      .select({
        reportCodes: request.reportCodes,
        fromDate: request.fromDate,
        toDate: request.toDate,
        areaProvinces: request.areaProvinces,
      })
      .from(request)
      .where(eq(request.id, requestId));
    if (!row) {
      throw new UnrecoverableError(`request ${requestId} not found`);
    }

    // Read once, held for the whole job (§6.4) — never a per-row join.
    const provinceRows = await db.select().from(province);
    const provinces = buildProvinceLookup(provinceRows);

    const runner = new ExtractionRunner(
      this.upstreamClient,
      new ScratchStore(),
      provinces,
    );

    return runner.run(
      {
        requestId,
        reportCodes: row.reportCodes,
        fromDate: row.fromDate,
        toDate: row.toDate,
        areaProvinces: row.areaProvinces,
      },
      {
        onCodeFetched: async (event) => {
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
  }

  /**
   * Rule 1 (§6.1) names two alerts and §6.3 names a third — each is its own
   * `extraction_alert_raised` event, raised only when its count is
   * non-zero, never for an absent field on its own (§6.1: "An absent field
   * is normal and must never alert").
   *
   * `impossibleDerivationInputs` is logged here rather than alerted: §6.3
   * puts that count on the permanent record via `job_completed`'s payload,
   * which this ticket does not emit (writing the file is #70's job) — it
   * is not dropped, only not yet durable beyond this log line.
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
      this.logger.warn(
        `request ${requestId}: ${result.counters.impossibleDerivationInputs} impossible onset_age derivation input(s)`,
      );
    }
  }
}
