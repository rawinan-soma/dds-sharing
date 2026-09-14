import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { Pool } from "pg";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { RequestsService } from "../requests/requests.service.js";
import type { SubmitRequestInput } from "../requests/submit-request.types.js";
import type { MailService } from "../mail/mail.service.js";
import { ReviewerQueueService } from "./reviewer-queue.service.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

// A stub, never a real SMTP send — mail delivery itself is MailService's own
// unit (mail.service.spec.ts) and rejection-email.ts's (rejection-email.spec.ts).
// This suite is about the Decision, not the network.
function stubMailService(): MailService {
  return { send: vi.fn().mockResolvedValue({ outcome: "sent", relayResponse: "250 OK" }) } as unknown as MailService;
}

function validInput(overrides: Partial<SubmitRequestInput> = {}): SubmitRequestInput {
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

  beforeAll(async () => {
    await runMigrations(adminUrl);
    adminPool = new Pool({ connectionString: adminUrl });
    appDb = createDb(appUrl);
    requestsService = new RequestsService(appDb);
    queueService = new ReviewerQueueService(appDb, stubMailService());
  });

  afterAll(async () => {
    await adminPool.end();
    await appDb.pool.end();
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
    const outcome = await requestsService.submit(input, { ip, userAgent: "vitest" });
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
    const olderId = await submitAt(validInput(), "198.51.100.1", new Date(now.getTime() - 3 * 3600_000));
    const newerId = await submitAt(validInput(), "198.51.100.2", now);
    await adminPool.query(`UPDATE request SET state = 'rejected' WHERE id = $1`, [newerId]);

    const rows = await queueService.listPending(now);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(olderId);
  });

  it("orders the pending zone oldest-first and carries name, workplace and group", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const first = await submitAt(
      validInput({ contact: { ...validInput().contact, name: "First", surname: "Requester", workplace: "Hospital A" } }),
      "198.51.100.3",
      new Date(now.getTime() - 2 * 3600_000),
    );
    const second = await submitAt(
      validInput({ contact: { ...validInput().contact, name: "Second", surname: "Requester", workplace: "Hospital B" } }),
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
    const staleId = await submitAt(validInput(), "198.51.100.5", new Date(now.getTime() - 10 * 24 * 3600_000));

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
    expect(detail!.probeRowCount).toBeNull();
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
    expect(provinceDetail!.area).toEqual({ kind: "province", label: "เชียงใหม่" });

    const regionDetail = await queueService.getDetail(regionId, now);
    expect(regionDetail!.area).toEqual({ kind: "region", label: "Health region 8" });
  });

  it("counts Requests ahead using the same oldest-first order as the list", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    const first = await submitAt(validInput(), "198.51.100.9", new Date(now.getTime() - 3 * 3600_000));
    const second = await submitAt(validInput(), "198.51.100.10", new Date(now.getTime() - 2 * 3600_000));
    const third = await submitAt(validInput(), "198.51.100.11", new Date(now.getTime() - 1 * 3600_000));

    expect((await queueService.getDetail(first, now))!.requestsAhead).toBe(0);
    expect((await queueService.getDetail(second, now))!.requestsAhead).toBe(1);
    expect((await queueService.getDetail(third, now))!.requestsAhead).toBe(2);
  });

  it("returns null for a Request that does not exist, and for one no longer pending", async () => {
    const now = new Date("2026-09-08T10:20:00+07:00");
    expect(await queueService.getDetail("00000000-0000-0000-0000-000000000000", now)).toBeNull();

    const id = await submitAt(validInput(), "198.51.100.12", now);
    await adminPool.query(`UPDATE request SET state = 'rejected' WHERE id = $1`, [id]);
    expect(await queueService.getDetail(id, now)).toBeNull();
  });

  // The Decision (spec §10.3, §10.4, ticket #66) -----------------------

  const reviewerId = "11111111-1111-1111-1111-111111111111";

  async function eventsOf(id: string): Promise<Array<{ type: string; actor_type: string; payload: unknown }>> {
    const { rows } = await adminPool.query(
      `SELECT type, actor_type, payload FROM request_event WHERE request_id = $1 ORDER BY id`,
      [id],
    );
    return rows;
  }

  describe("approve", () => {
    it("moves a pending Request to queued and writes an approved event carrying the Snapshot", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.1", now);

      const outcome = await queueService.approve(id, reviewerId, now);
      expect(outcome).toEqual({ kind: "approved", decidedAt: now.toISOString() });

      const { rows } = await adminPool.query(`SELECT state FROM request WHERE id = $1`, [id]);
      expect(rows[0].state).toBe("queued");

      const events = await eventsOf(id);
      const approved = events.find((e) => e.type === "approved")!;
      expect(approved.actor_type).toBe("reviewer");
      expect(approved.payload).toMatchObject({
        snapshot: {
          diseaseGroupName: "โรคซิลิโคสิส",
          reportCodes: ["202", "203"],
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          area: { kind: "national" },
          probeRowCount: "pending",
          workplace: "โรงพยาบาลตัวอย่าง",
        },
      });
    });

    it("refuses a second Decision on a Request already decided, without writing a second event", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.2", now);

      await queueService.approve(id, reviewerId, now);
      const secondAttempt = await queueService.approve(id, reviewerId, now);
      expect(secondAttempt).toEqual({ kind: "not_pending" });

      const events = await eventsOf(id);
      expect(events.filter((e) => e.type === "approved")).toHaveLength(1);
    });

    it("returns not_found for an id that does not exist", async () => {
      const outcome = await queueService.approve("00000000-0000-0000-0000-000000000000", reviewerId, new Date());
      expect(outcome).toEqual({ kind: "not_found" });
    });
  });

  describe("reject", () => {
    it("requires a mandatory internal note of at least 10 characters, and writes nothing when it is too short", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.3", now);

      const outcome = await queueService.reject(id, reviewerId, "too short", now);
      expect(outcome).toEqual({ kind: "note_too_short" });

      const { rows } = await adminPool.query(`SELECT state FROM request WHERE id = $1`, [id]);
      expect(rows[0].state).toBe("pending");
      expect(await eventsOf(id)).toHaveLength(1); // only `submitted`
    });

    it("moves a pending Request to rejected, writes the Snapshot and the note, and sends the no-reason email", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.4", now);
      const mail = stubMailService();
      const service = new ReviewerQueueService(appDb, mail);

      const outcome = await service.reject(id, reviewerId, "Contact number does not answer, three attempts made.", now);
      expect(outcome).toEqual({ kind: "rejected", decidedAt: now.toISOString() });

      const { rows } = await adminPool.query(`SELECT state FROM request WHERE id = $1`, [id]);
      expect(rows[0].state).toBe("rejected");

      const events = await eventsOf(id);
      const rejected = events.find((e) => e.type === "rejected")!;
      expect(rejected.actor_type).toBe("reviewer");
      expect(rejected.payload).toMatchObject({
        internalNote: "Contact number does not answer, three attempts made.",
        snapshot: { workplace: "โรงพยาบาลตัวอย่าง" },
      });

      expect(mail.send).toHaveBeenCalledOnce();
      const sent = events.find((e) => e.type === "mail_sent")!;
      expect(sent.actor_type).toBe("system");
      expect(sent.payload).toMatchObject({ kind: "rejection" });
    });

    it("still rejects and records a mail_send_failed event when the send fails — a Decision never depends on delivery", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.5", now);
      const failingMail = { send: vi.fn().mockResolvedValue({ outcome: "failed", error: "connection refused" }) } as unknown as MailService;
      const service = new ReviewerQueueService(appDb, failingMail);

      const outcome = await service.reject(id, reviewerId, "Ten characters, easily.", now);
      expect(outcome).toEqual({ kind: "rejected", decidedAt: now.toISOString() });

      const events = await eventsOf(id);
      expect(events.some((e) => e.type === "rejected")).toBe(true);
      const failed = events.find((e) => e.type === "mail_send_failed")!;
      expect(failed.payload).toMatchObject({ tryNumber: 1, relayError: "connection refused" });
    });
  });

  describe("expiry beats a late Decision (§10.4)", () => {
    it("refuses an approve past 24 business hours, marks the Request expired, and records the refused attempt", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00"); // a Tuesday
      const id = await submitAt(validInput(), "198.51.101.6", new Date(now.getTime() - 10 * 24 * 3600_000));

      const outcome = await queueService.approve(id, reviewerId, now);
      expect(outcome.kind).toBe("expired");

      const { rows } = await adminPool.query(`SELECT state FROM request WHERE id = $1`, [id]);
      expect(rows[0].state).toBe("expired");

      const events = await eventsOf(id);
      expect(events.some((e) => e.type === "approved")).toBe(false);
      const expired = events.find((e) => e.type === "expired")!;
      expect(expired.actor_type).toBe("system");
      expect(expired.payload).toMatchObject({ decisionAttemptedAndRefused: true });
      expect((expired.payload as { businessHoursElapsed: number }).businessHoursElapsed).toBeGreaterThanOrEqual(24);
    });
  });

  describe("amendNote (§12.2, §12.3)", () => {
    it("corrects a rejected Request's note with a note_amended event citing the rejected event, never an edit", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.7", now);
      await queueService.reject(id, reviewerId, "Original note, typed under pressure.", now);

      const rejectedEvent = (await eventsOf(id)).find((e) => e.type === "rejected")!;
      const { rows: rejectedIdRows } = await adminPool.query(
        `SELECT id FROM request_event WHERE request_id = $1 AND type = 'rejected'`,
        [id],
      );
      // pg's driver returns bigint columns as strings; drizzle's own
      // bigserial({mode:"number"}) mapping is what actually lands in the
      // jsonb payload as a number (see requestEvent.id in schema.ts).
      const rejectedEventId = Number(rejectedIdRows[0].id);

      const outcome = await queueService.amendNote(id, reviewerId, "Corrected note: contact confirmed absent.", now);
      expect(outcome).toEqual({ kind: "amended" });

      // The original event is untouched — a correction is a new row, never an UPDATE.
      expect(rejectedEvent.payload).toMatchObject({ internalNote: "Original note, typed under pressure." });

      const { rows: amended } = await adminPool.query(
        `SELECT payload FROM request_event WHERE request_id = $1 AND type = 'note_amended'`,
        [id],
      );
      expect(amended[0].payload).toEqual({ citesEventId: rejectedEventId, note: "Corrected note: contact confirmed absent." });
    });

    it("refuses to amend a note on a Request that was never rejected", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.8", now);

      const outcome = await queueService.amendNote(id, reviewerId, "A perfectly good replacement note.", now);
      expect(outcome).toEqual({ kind: "not_rejected" });
    });

    it("refuses an amendment shorter than 10 characters", async () => {
      const now = new Date("2026-09-08T10:20:00+07:00");
      const id = await submitAt(validInput(), "198.51.101.9", now);
      await queueService.reject(id, reviewerId, "Original note, long enough to pass.", now);

      const outcome = await queueService.amendNote(id, reviewerId, "short", now);
      expect(outcome).toEqual({ kind: "note_too_short" });
    });
  });
});
