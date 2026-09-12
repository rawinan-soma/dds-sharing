import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { requestContact, requestEvent } from "../db/schema.js";
import { RequestsService } from "./requests.service.js";
import type { SubmitRequestInput } from "./submit-request.types.js";

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

describe.skipIf(!adminUrl || !appUrl)("RequestsService", () => {
  let adminPool: Pool;
  let service: RequestsService;
  let appDb: ReturnType<typeof createDb>;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    adminPool = new Pool({ connectionString: adminUrl });
    appDb = createDb(appUrl);
    service = new RequestsService(appDb);
  });

  afterAll(async () => {
    await adminPool.end();
    await appDb.pool.end();
  });

  // request, request_contact and reference_number_counter are exclusive to
  // this file's tests (no other spec touches them), so wiping them between
  // tests is safe. request_event is shared with other DB-gated specs
  // running concurrently against the same Postgres — never wiped or
  // asserted on table-wide, only scoped to a test's own unique IP.
  // The 198.51.100.0/24 range (TEST-NET-2, RFC 5737) is reserved for
  // documentation and used by no other spec — safe to delete unconditionally,
  // unlike a blanket `DELETE FROM request_event`, and unlike leaving it
  // alone entirely: the docker volume persists across `docker compose down`,
  // so rows from an earlier run of this same file otherwise accumulate
  // across sessions and eventually collide with a fresh run's counts.
  beforeEach(async () => {
    await adminPool.query(
      "DELETE FROM request_event WHERE ip::inet <<= '198.51.100.0/24'::inet",
    );
    await adminPool.query("DELETE FROM request_contact");
    await adminPool.query("DELETE FROM request");
    await adminPool.query("DELETE FROM reference_number_counter");
  });

  it("submits, storing the frozen Report codes, a submitted event, and split-out contact fields", async () => {
    const outcome = await service.submit(validInput(), {
      ip: "198.51.100.1",
      userAgent: "vitest",
    });
    expect(outcome.kind).toBe("submitted");
    if (outcome.kind !== "submitted") throw new Error("expected submitted");
    expect(outcome.referenceNumber).toMatch(/^REQ-\d{4}-0001$/);
    expect(outcome.diseaseGroupNameTh).toBe("โรคซิลิโคสิส");

    const { db } = appDb;
    const [contactRow] = await db.select().from(requestContact);
    expect(contactRow.email).toBe("somchai@example.com");

    const events = await db
      .select()
      .from(requestEvent)
      .where(eq(requestEvent.ip, "198.51.100.1"));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("submitted");
    expect(events[0].actorType).toBe("requester");
    expect(events[0].ip).toBe("198.51.100.1");
    expect(events[0].userAgent).toBe("vitest");
  });

  it("increments the reference number counter per submit, within one Buddhist year", async () => {
    const first = await service.submit(validInput(), {
      ip: "198.51.100.11",
      userAgent: "vitest",
    });
    const second = await service.submit(validInput(), {
      ip: "198.51.100.12",
      userAgent: "vitest",
    });
    if (first.kind !== "submitted" || second.kind !== "submitted")
      throw new Error("expected submitted");
    expect(first.referenceNumber).not.toBe(second.referenceNumber);
    expect(second.referenceNumber.endsWith("0002")).toBe(true);
  });

  it("rejects a second submit from the same IP with an unfinished Request (§4.8)", async () => {
    const first = await service.submit(validInput(), {
      ip: "198.51.100.13",
      userAgent: "vitest",
    });
    if (first.kind !== "submitted") throw new Error("expected submitted");

    const second = await service.submit(validInput(), {
      ip: "198.51.100.13",
      userAgent: "vitest",
    });
    expect(second.kind).toBe("duplicate");
    if (second.kind !== "duplicate") throw new Error("expected duplicate");
    expect(second.existingReferenceNumber).toBe(first.referenceNumber);
    expect(second.existingState).toBe("pending");
  });

  it("does not suppress a submit from a different IP", async () => {
    await service.submit(validInput(), {
      ip: "198.51.100.14",
      userAgent: "vitest",
    });
    const second = await service.submit(validInput(), {
      ip: "198.51.100.15",
      userAgent: "vitest",
    });
    expect(second.kind).toBe("submitted");
  });

  it("stores a region selection as its frozen province expansion, never a bare region", async () => {
    const outcome = await service.submit(
      validInput({ area: { kind: "region", region: 8 } }),
      { ip: "198.51.100.16", userAgent: "vitest" },
    );
    expect(outcome.kind).toBe("submitted");
    if (outcome.kind !== "submitted") throw new Error("expected submitted");
    expect(outcome.area).toEqual({
      kind: "region",
      region: 8,
      provinces: expect.arrayContaining([
        expect.objectContaining({ healthRegion: 8 }),
      ]),
    });

    const rows = await adminPool.query(
      `SELECT area_kind, area_region, area_provinces FROM request WHERE reference_number = $1`,
      [outcome.referenceNumber],
    );
    expect(rows.rows[0].area_kind).toBe("region");
    expect(rows.rows[0].area_region).toBe(8);
    expect(rows.rows[0].area_provinces.length).toBeGreaterThan(1);
  });

  it("returns a validation_error outcome without touching the database on an invalid submit", async () => {
    const outcome = await service.submit(validInput({ diseaseGroupId: "" }), {
      ip: "198.51.100.17",
      userAgent: "vitest",
    });
    expect(outcome.kind).toBe("validation_error");

    const { db } = appDb;
    const events = await db
      .select()
      .from(requestEvent)
      .where(eq(requestEvent.ip, "198.51.100.17"));
    expect(events).toHaveLength(0);
  });

  it("app_role can INSERT and SELECT the request tables but cannot UPDATE or DELETE them (§12.3 immutability)", async () => {
    const outcome = await service.submit(validInput(), {
      ip: "198.51.100.18",
      userAgent: "vitest",
    });
    if (outcome.kind !== "submitted") throw new Error("expected submitted");

    const appPool = new Pool({ connectionString: appUrl });
    try {
      await expect(
        appPool.query(
          `UPDATE request SET disease_group_name_th = 'x' WHERE reference_number = $1`,
          [outcome.referenceNumber],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        appPool.query(`DELETE FROM request WHERE reference_number = $1`, [
          outcome.referenceNumber,
        ]),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        appPool.query(`UPDATE request_contact SET email = 'x'`),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        appPool.query(`DELETE FROM request_contact`),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await appPool.end();
    }
  });
});
