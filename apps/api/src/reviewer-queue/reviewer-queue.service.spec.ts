import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { request, requestContact } from "../db/schema.js";
import { ProbeService } from "../probe/probe.service.js";
import { RequestsService } from "../requests/requests.service.js";
import type { SubmitRequestInput } from "../requests/submit-request.types.js";
import { UpstreamClient } from "../upstream/upstream-client.js";
import {
  FAKE_UPSTREAM_SCENARIOS,
  startFakeUpstreamServer,
  type FakeUpstreamServerHandle,
} from "../upstream/fake-harness/fake-upstream-server.js";
import { ReviewerQueueService } from "./reviewer-queue.service.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

function validInput(
  overrides: Partial<SubmitRequestInput> = {},
): SubmitRequestInput {
  return {
    diseaseGroupId: "silicosis",
    from: "2026-01-01",
    to: "2026-01-31",
    contact: {
      name: "สมชาย",
      surname: "ใจดี",
      tel: "0812345678",
      email: "somchai@example.com",
      workplace: "โรงพยาบาลตัวอย่าง",
    },
    ...overrides,
  };
}

describe.skipIf(!adminUrl || !appUrl)("ReviewerQueueService", () => {
  let adminPool: Pool;
  let appDb: ReturnType<typeof createDb>;
  let requestsService: RequestsService;
  let queueService: ReviewerQueueService;
  let probeService: ProbeService;
  let harness: FakeUpstreamServerHandle;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    adminPool = new Pool({ connectionString: adminUrl });
    appDb = createDb(appUrl);
    harness = await startFakeUpstreamServer();
    const upstreamClient = new UpstreamClient({
      baseUrl: harness.url,
      token: "test-token",
      retryBaseDelayMs: 1,
    });
    probeService = new ProbeService(appDb, upstreamClient);
    requestsService = new RequestsService(appDb, probeService);
    queueService = new ReviewerQueueService(appDb);
  });

  afterAll(async () => {
    await adminPool.end();
    await appDb.pool.end();
    await harness.close();
  });

  // Shared with requests.service.spec.ts's tables — safe because the suite
  // runs with fileParallelism disabled (vitest.config.ts) and every test in
  // both files wipes these same tables before it runs.
  beforeEach(async () => {
    await adminPool.query("DELETE FROM request_event");
    await adminPool.query("DELETE FROM request_contact");
    await adminPool.query("DELETE FROM request");
    await adminPool.query("DELETE FROM reference_number_counter");
  });

  async function submitAt(
    input: SubmitRequestInput,
    ip: string,
    submittedAt: Date,
  ): Promise<string> {
    const outcome = await requestsService.submit(input, {
      ip,
      userAgent: "vitest",
    });
    if (outcome.kind !== "submitted") throw new Error("expected submitted");
    await adminPool.query(
      `UPDATE request SET submitted_at = $1 WHERE reference_number = $2`,
      [submittedAt, outcome.referenceNumber],
    );
    const { rows } = await adminPool.query(
      `SELECT id FROM request WHERE reference_number = $1`,
      [outcome.referenceNumber],
    );
    return rows[0].id as string;
  }

  it("lists only pending Requests, oldest first", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00"); // a Tuesday, matches the design fixture's clock
    const olderId = await submitAt(
      validInput(),
      "198.51.100.1",
      new Date(now.getTime() - 3 * 3600_000),
    );
    const newerId = await submitAt(validInput(), "198.51.100.2", now);
    await adminPool.query(
      `UPDATE request SET state = 'rejected' WHERE id = $1`,
      [newerId],
    );

    const rows = await queueService.listPending(now);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(olderId);
  });

  it("orders the pending zone oldest-first and carries name, workplace and group", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const first = await submitAt(
      validInput({
        contact: {
          ...validInput().contact,
          name: "First",
          surname: "Requester",
          workplace: "Hospital A",
        },
      }),
      "198.51.100.3",
      new Date(now.getTime() - 2 * 3600_000),
    );
    const second = await submitAt(
      validInput({
        contact: {
          ...validInput().contact,
          name: "Second",
          surname: "Requester",
          workplace: "Hospital B",
        },
      }),
      "198.51.100.4",
      new Date(now.getTime() - 1 * 3600_000),
    );

    const rows = await queueService.listPending(now);
    expect(rows.map((r) => r.id)).toEqual([first, second]);
    expect(rows[0].requesterName).toBe("First Requester");
    expect(rows[0].workplace).toBe("Hospital A");
    expect(rows[0].diseaseGroupNameTh).toBe("โรคซิลิโคสิส");
    expect(rows[0].isActionable).toBe(true);
  });

  it("marks a Request past 24 business hours as not actionable, but keeps it on the pending list", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const staleId = await submitAt(
      validInput(),
      "198.51.100.5",
      new Date(now.getTime() - 10 * 24 * 3600_000),
    );

    const rows = await queueService.listPending(now);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(staleId);
    expect(rows[0].isActionable).toBe(false);
    expect(rows[0].timeRemainingLabel).toBe("expired");
    expect(rows[0].businessHoursRemaining).toBe(0);
  });

  it("returns the five contact fields, group name over report codes, dates and 'Whole country' for a national Request", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const id = await submitAt(validInput(), "198.51.100.6", now);

    const detail = await queueService.getDetail(id, now);
    expect(detail).not.toBeNull();
    expect(detail!.contact).toEqual({
      name: "สมชาย",
      surname: "ใจดี",
      tel: "0812345678",
      email: "somchai@example.com",
      workplace: "โรงพยาบาลตัวอย่าง",
    });
    expect(detail!.diseaseGroupNameTh).toBe("โรคซิลิโคสิส");
    expect(detail!.reportCodes).toEqual(["202", "203"]);
    expect(detail!.fromDate).toBe("2026-01-01");
    expect(detail!.toDate).toBe("2026-01-31");
    expect(detail!.days).toBe(31);
    expect(detail!.area).toEqual({ kind: "national", label: "Whole country" });
    // probeRowCount's three states are covered in their own describe block below.
    expect(detail!.requestsAhead).toBe(0);
  });

  it("names a province area by its name, and a region area by its health region", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const provinceId = await submitAt(
      validInput({ area: { kind: "province", provinceId: "50" } }), // เชียงใหม่
      "198.51.100.7",
      now,
    );
    const regionId = await submitAt(
      validInput({ area: { kind: "region", region: 8 } }),
      "198.51.100.8",
      new Date(now.getTime() + 1000),
    );

    const provinceDetail = await queueService.getDetail(provinceId, now);
    expect(provinceDetail!.area).toEqual({
      kind: "province",
      label: "เชียงใหม่",
    });

    const regionDetail = await queueService.getDetail(regionId, now);
    expect(regionDetail!.area).toEqual({
      kind: "region",
      label: "Health region 8",
    });
  });

  it("counts Requests ahead using the same oldest-first order as the list", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const first = await submitAt(
      validInput(),
      "198.51.100.9",
      new Date(now.getTime() - 3 * 3600_000),
    );
    const second = await submitAt(
      validInput(),
      "198.51.100.10",
      new Date(now.getTime() - 2 * 3600_000),
    );
    const third = await submitAt(
      validInput(),
      "198.51.100.11",
      new Date(now.getTime() - 1 * 3600_000),
    );

    expect((await queueService.getDetail(first, now))!.requestsAhead).toBe(0);
    expect((await queueService.getDetail(second, now))!.requestsAhead).toBe(1);
    expect((await queueService.getDetail(third, now))!.requestsAhead).toBe(2);
  });

  it("returns null for a Request that does not exist, and for one no longer pending", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    expect(
      await queueService.getDetail("00000000-0000-0000-0000-000000000000", now),
    ).toBeNull();

    const id = await submitAt(validInput(), "198.51.100.12", now);
    await adminPool.query(
      `UPDATE request SET state = 'rejected' WHERE id = $1`,
      [id],
    );
    expect(await queueService.getDetail(id, now)).toBeNull();
  });

  // §5.4: the count is read from the audit spine (probe_performed /
  // probe_failed), never a column on `request` itself, so these insert a
  // pending Request directly and drive the Probe explicitly rather than
  // racing its background write from a real submit.
  describe("probeRowCount (§5.4)", () => {
    async function insertPendingRequest(
      reportCodes: string[],
    ): Promise<string> {
      const { db } = appDb;
      const [inserted] = await db
        .insert(request)
        .values({
          referenceNumber: `REQ-PROBE-${randomUUID()}`,
          diseaseGroupId: "silicosis",
          diseaseGroupNameTh: "โรคซิลิโคสิส",
          reportCodes,
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
        })
        .returning({ id: request.id });
      await db.insert(requestContact).values({
        requestId: inserted.id,
        name: "สมชาย",
        surname: "ใจดี",
        tel: "0812345678",
        email: "somchai@example.com",
        workplace: "โรงพยาบาลตัวอย่าง",
      });
      return inserted.id;
    }

    it("reads 'pending' before the Probe has written anything", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await insertPendingRequest(["202"]);

      const detail = await queueService.getDetail(id, now);
      expect(detail!.probeRowCount).toBe("pending");
      expect(detail!.isActionable).toBe(true);
    });

    it("reads the summed total once probe_performed lands", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await insertPendingRequest(["202", "203"]);

      // Default fixture: 2 rows per code on the fake harness.
      await probeService.run({
        requestId: id,
        reportCodes: ["202", "203"],
        from: "2026-01-01",
        to: "2026-01-31",
      });

      const detail = await queueService.getDetail(id, now);
      expect(detail!.probeRowCount).toBe(4);
    });

    it("reads 'failed' once probe_failed lands, and approve stays usable", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const failingCode = String(FAKE_UPSTREAM_SCENARIOS.truncatedPage);
      const id = await insertPendingRequest(["202", failingCode]);

      await probeService.run({
        requestId: id,
        reportCodes: ["202", failingCode],
        from: "2026-01-01",
        to: "2026-01-31",
      });

      const detail = await queueService.getDetail(id, now);
      expect(detail!.probeRowCount).toBe("failed");
      // §5.4: a Decision waits on none of the three states.
      expect(detail!.isActionable).toBe(true);
    });
  });
});
