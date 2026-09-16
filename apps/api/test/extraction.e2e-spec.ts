import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/configure-app.js";
import { ExtractionQueueService } from "../src/extraction/extraction-queue.service.js";
import { ExtractionReconcileService } from "../src/extraction/extraction-reconcile.service.js";
import {
  FAKE_UPSTREAM_SCENARIOS,
  startFakeUpstreamServer,
  type FakeUpstreamServerHandle,
} from "../src/upstream/fake-harness/fake-upstream-server.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

interface RawRequestOptions {
  state: string;
  reportCodes: string[];
  bullJobId?: string | null;
}

async function insertRawRequest(
  pool: Pool,
  options: RawRequestOptions,
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO request
      (id, reference_number, state, disease_group_id, disease_group_name_th,
       report_codes, from_date, to_date, area_kind, area_provinces, bull_job_id)
     VALUES ($1, $2, $3, 'silicosis', 'test', $4, '2026-01-01', '2026-01-08', 'national', '{}', $5)`,
    [id, `REQ-TEST-${id.slice(0, 8)}`, options.state, options.reportCodes, options.bullJobId ?? null],
  );
  await pool.query(
    `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
     VALUES ($1, 'test', 'requester', '0800000000', 'requester@example.com', 'test workplace')`,
    [id],
  );
  return id;
}

async function pollUntil<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (predicate(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe.skipIf(!adminUrl || !appUrl)(
  "The extraction pipeline (e2e, ticket #69)",
  () => {
    let app: INestApplication;
    let adminPool: Pool;
    let harness: FakeUpstreamServerHandle;

    beforeAll(async () => {
      harness = await startFakeUpstreamServer();
      process.env.UPSTREAM_BASE_URL = harness.url;

      app = await NestFactory.create(AppModule, { logger: false });
      configureApp(app);
      await app.listen(0);
      adminPool = new Pool({ connectionString: adminUrl });
    });

    afterAll(async () => {
      await app.close();
      await adminPool.end();
      await harness.close();
    });

    beforeEach(async () => {
      await adminPool.query("DELETE FROM request_event");
      await adminPool.query("DELETE FROM request_contact");
      await adminPool.query("DELETE FROM request");
    });

    it("§7.7: enqueue writes bull_job_id and job_queued, and the worker runs the job through to code_fetched", async () => {
      const id = await insertRawRequest(adminPool, {
        state: "queued",
        reportCodes: ["202"],
      });

      const extractionQueueService = app.get(ExtractionQueueService);
      await extractionQueueService.enqueue(id);

      const row = await adminPool.query(
        "SELECT bull_job_id FROM request WHERE id = $1",
        [id],
      );
      expect(row.rows[0].bull_job_id).toBeTruthy();

      const events = await pollUntil(
        () =>
          adminPool.query(
            "SELECT type FROM request_event WHERE request_id = $1 ORDER BY id",
            [id],
          ),
        (result) => result.rows.some((r) => r.type === "code_fetched"),
      );
      const types = events.rows.map((r) => r.type as string);
      expect(types).toContain("job_queued");
      expect(types).toContain("job_started");
      expect(types).toContain("code_fetched");
      expect(types).not.toContain("job_failed");

      const stateRow = await adminPool.query(
        "SELECT state FROM request WHERE id = $1",
        [id],
      );
      expect(stateRow.rows[0].state).toBe("running");
    });

    it("§7.5/§14.5: a completeness mismatch fails the job, recording the cause and never a case field", async () => {
      const id = await insertRawRequest(adminPool, {
        state: "queued",
        reportCodes: [String(FAKE_UPSTREAM_SCENARIOS.shiftingTotalItems)],
      });

      await app.get(ExtractionQueueService).enqueue(id);

      const events = await pollUntil(
        () =>
          adminPool.query(
            "SELECT type, payload FROM request_event WHERE request_id = $1 ORDER BY id",
            [id],
          ),
        (result) =>
          result.rows.some((r) => r.type === "mail_sent" || r.type === "mail_send_failed"),
      );
      const types = events.rows.map((r) => r.type as string);
      const failed = events.rows.find((r) => r.type === "job_failed");
      expect(failed?.payload.cause).toBe("completeness_mismatch");

      const stateRow = await adminPool.query(
        "SELECT state FROM request WHERE id = $1",
        [id],
      );
      expect(stateRow.rows[0].state).toBe("failed");

      // §14.3: the Requester is emailed on failure, undifferentiated — the
      // cause split (`completeness_mismatch`) stays in `job_failed` alone,
      // never in what was sent to them.
      expect(types).toEqual(expect.arrayContaining(["job_failed"]));
      const mailEvent = events.rows.find(
        (r) => r.type === "mail_sent" || r.type === "mail_send_failed",
      )!;
      if (mailEvent.type === "mail_sent") {
        expect(mailEvent.payload.kind).toBe("extraction_failure");
      }
      expect(JSON.stringify(mailEvent.payload)).not.toContain(
        "completeness_mismatch",
      );
    });

    it("§7.7: reconcile re-enqueues a queued or running Request with no live BullMQ job, and leaves pending alone", async () => {
      const orphanQueued = await insertRawRequest(adminPool, {
        state: "queued",
        reportCodes: ["202"],
        bullJobId: "this-job-id-was-never-actually-enqueued",
      });
      const orphanRunning = await insertRawRequest(adminPool, {
        state: "running",
        reportCodes: ["202"],
        bullJobId: "this-job-id-crashed-mid-run",
      });
      const pending = await insertRawRequest(adminPool, {
        state: "pending",
        reportCodes: ["202"],
        bullJobId: null,
      });

      await app.get(ExtractionReconcileService).onApplicationBootstrap();

      for (const [label, id, staleJobId] of [
        ["queued", orphanQueued, "this-job-id-was-never-actually-enqueued"],
        ["running", orphanRunning, "this-job-id-crashed-mid-run"],
      ] as const) {
        const row = await pollUntil(
          () =>
            adminPool.query("SELECT bull_job_id FROM request WHERE id = $1", [
              id,
            ]),
          (result) => result.rows[0].bull_job_id !== staleJobId,
        );
        expect(row.rows[0].bull_job_id, `${label} orphan`).not.toBe(staleJobId);
        const events = await adminPool.query(
          "SELECT type FROM request_event WHERE request_id = $1",
          [id],
        );
        expect(events.rows.map((r) => r.type), `${label} orphan events`).toContain(
          "job_queued",
        );
      }

      const pendingRow = await adminPool.query(
        "SELECT bull_job_id FROM request WHERE id = $1",
        [pending],
      );
      expect(pendingRow.rows[0].bull_job_id).toBeNull();
      const pendingEvents = await adminPool.query(
        "SELECT type FROM request_event WHERE request_id = $1",
        [pending],
      );
      expect(pendingEvents.rows).toHaveLength(0);
    });
  },
);
