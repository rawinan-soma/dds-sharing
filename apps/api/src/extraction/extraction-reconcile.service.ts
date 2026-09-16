import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import type { Queue } from "bullmq";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import { request } from "../db/schema.js";
import { EXTRACTION_QUEUE } from "./extraction-queue.module.js";
import { ExtractionQueueService } from "./extraction-queue.service.js";

/**
 * §7.7's durability step: "on worker startup, reconcile — any Postgres job
 * in queued/running with no live BullMQ job is re-enqueued." Without this,
 * "durable jobs" is one Redis persistence misconfiguration away from being
 * false — Postgres would keep saying a Request is being worked on while
 * nothing is actually queued to do it.
 *
 * **Never touches `pending`** — an unapproved Request has no work, and its
 * clock is derived (§15.1), not scheduled.
 *
 * This re-enqueues, never fails, the implementer's choice the spec leaves
 * open: failing outright would turn a Redis blip into a Requester's
 * extraction-failure email for no upstream-shaped reason at all.
 */
@Injectable()
export class ExtractionReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExtractionReconcileService.name);

  constructor(
    @Inject(APP_DB) private readonly appDb: AppDb,
    @Inject(EXTRACTION_QUEUE) private readonly queue: Queue,
    private readonly extractionQueueService: ExtractionQueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { db } = this.appDb;
    const rows = await db
      .select({ id: request.id, bullJobId: request.bullJobId })
      .from(request)
      .where(inArray(request.state, ["queued", "running"]));

    for (const row of rows) {
      const liveJob = row.bullJobId
        ? await this.queue.getJob(row.bullJobId)
        : undefined;
      if (liveJob) continue;

      this.logger.warn(
        `reconcile: request ${row.id} was ${row.bullJobId ? "missing its BullMQ job" : "never given one"} — re-enqueuing`,
      );
      await this.extractionQueueService.enqueue(row.id);
    }
  }
}
