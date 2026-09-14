import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { requestEvent } from "../db/schema.js";
import { UpstreamClient } from "../upstream/upstream-client.js";
import {
  FAKE_UPSTREAM_SCENARIOS,
  startFakeUpstreamServer,
  type FakeUpstreamServerHandle,
} from "../upstream/fake-harness/fake-upstream-server.js";
import { ProbeService } from "./probe.service.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("ProbeService (§5.4)", () => {
  let adminPool: Pool;
  let appDb: ReturnType<typeof createDb>;
  let harness: FakeUpstreamServerHandle;
  let probeService: ProbeService;

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
  });

  afterAll(async () => {
    await adminPool.end();
    await appDb.pool.end();
    await harness.close();
  });

  beforeEach(async () => {
    await adminPool.query("DELETE FROM request_event");
  });

  async function eventsFor(requestId: string) {
    const { db } = appDb;
    return db
      .select()
      .from(requestEvent)
      .where(eq(requestEvent.requestId, requestId));
  }

  it("writes probe_performed with per-code and total totalItems, the span, and every x-request-id, over exactly one call per code", async () => {
    const requestId = randomUUID();

    await probeService.run({
      requestId,
      reportCodes: ["202", "203"],
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const events = await eventsFor(requestId);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("probe_performed");
    expect(events[0].actorType).toBe("system");

    const payload = events[0].payload as {
      span: { start: string; end: string };
      codes: Array<{
        groupCode: string;
        calls: number;
        totalItems: number;
        xRequestIds: Array<string | null>;
      }>;
      totalItems: number;
    };
    // The span builder's half-open conversion (§4.3) — end is exclusive, one day past the inclusive `to`.
    expect(payload.span).toEqual({ start: "2026-01-01", end: "2026-02-01" });
    expect(payload.codes).toHaveLength(2);
    for (const code of payload.codes) {
      expect(["202", "203"]).toContain(code.groupCode);
      expect(code.totalItems).toBe(2);
      expect(code.calls).toBe(1);
      expect(code.xRequestIds).toHaveLength(1);
      expect(code.xRequestIds[0]).not.toBeNull();
    }
    expect(payload.totalItems).toBe(4);
  });

  it("abandons the whole Probe when one code exhausts its retries, discarding codes already probed", async () => {
    const requestId = randomUUID();
    const failingCode = String(FAKE_UPSTREAM_SCENARIOS.truncatedPage);

    await probeService.run({
      requestId,
      reportCodes: ["202", failingCode],
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const events = await eventsFor(requestId);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("probe_failed");
    expect(events[0].actorType).toBe("system");

    const payload = events[0].payload as {
      groupCode: string;
      errors: Array<{ message: string; xRequestId: string | null }>;
    };
    expect(payload.groupCode).toBe(failingCode);
    expect(payload.errors).toHaveLength(3);
    for (const error of payload.errors) {
      expect(error.message).toBe("malformed_response");
    }
  });

  it("raises no Alert of any kind for an abandoned Probe (§5.4) — only probe_failed is written", async () => {
    const requestId = randomUUID();

    await probeService.run({
      requestId,
      reportCodes: [String(FAKE_UPSTREAM_SCENARIOS.truncatedPage)],
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const events = await eventsFor(requestId);
    expect(events.map((e) => e.type)).toEqual(["probe_failed"]);
  });

  it("never rejects, even when a code fails, and never throws to its caller", async () => {
    const requestId = randomUUID();

    await expect(
      probeService.run({
        requestId,
        reportCodes: [String(FAKE_UPSTREAM_SCENARIOS.truncatedPage)],
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).resolves.toBeUndefined();
  });
});
