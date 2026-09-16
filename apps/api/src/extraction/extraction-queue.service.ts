import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Queue } from "bullmq";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import { request, requestEvent } from "../db/schema.js";
import type { JobQueuedPayload } from "../db/events.js";
import {
  EXTRACTION_QUEUE_NAME,
  LOW_DISK_MAX_DEFERRALS,
  LOW_DISK_RETRY_DELAY_MS,
} from "./queue-constants.js";
import { EXTRACTION_QUEUE } from "./extraction-queue.module.js";

export interface ExtractionJobPayload {
  requestId: string;
}

/**
 * Approval's other half (spec §7.7, §10.3): the Decision already moves the
 * Request to `queued`; this writes the BullMQ reference beside it and the
 * `job_queued` event. The BullMQ payload carries the Request id and
 * nothing else (§14.5) — the worker re-reads everything it needs from
 * Postgres.
 */
@Injectable()
export class ExtractionQueueService {
  constructor(
    @Inject(APP_DB) private readonly appDb: AppDb,
    @Inject(EXTRACTION_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(requestId: string, now: Date = new Date()): Promise<void> {
    const job = await this.queue.add(
      EXTRACTION_QUEUE_NAME,
      { requestId } satisfies ExtractionJobPayload,
      {
        // A generous attempt budget exists for exactly one reason: the
        // low-disk deferral (§7.8) retrying with a fixed backoff. Every
        // other failure the worker throws as a BullMQ `UnrecoverableError`,
        // which ends the job on its first attempt regardless of this
        // number (extraction.processor.ts).
        attempts: LOW_DISK_MAX_DEFERRALS,
        backoff: { type: "fixed", delay: LOW_DISK_RETRY_DELAY_MS },
      },
    );

    const { db } = this.appDb;
    await db
      .update(request)
      .set({ bullJobId: job.id })
      .where(eq(request.id, requestId));

    await db.insert(requestEvent).values({
      requestId,
      type: "job_queued",
      actorType: "system",
      payload: { requestId } satisfies JobQueuedPayload,
      occurredAt: now,
    });
  }
}
