import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UpstreamClient } from "../upstream/upstream-client.js";
import {
  FAKE_UPSTREAM_SCENARIOS,
  SLOW_PAGE_DELAY_MS,
  startFakeUpstreamServer,
  type FakeUpstreamServerHandle,
} from "../upstream/fake-harness/fake-upstream-server.js";
import type { UpstreamLogger } from "../upstream/upstream-client.types.js";
import { buildProvinceLookup } from "./epidem-health-zone.js";
import { ExtractionRunner, type CodeFetchedEvent } from "./extraction-runner.js";
import { ScratchStore } from "./scratch-store.js";
import { StallError } from "./stall-watchdog.js";

function spyLogger(): UpstreamLogger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logCall: (fields) => lines.push(JSON.stringify(fields)),
    logError: (fields) => lines.push(JSON.stringify(fields)),
  };
}

function collectingEvents(): {
  events: CodeFetchedEvent[];
  onCodeFetched(event: CodeFetchedEvent): void;
} {
  const events: CodeFetchedEvent[] = [];
  return { events, onCodeFetched: (event) => events.push(event) };
}

const provinces = buildProvinceLookup([
  { provinceId: "10", healthRegion: 4 },
]);

describe("ExtractionRunner against the fake upstream harness", () => {
  let harness: FakeUpstreamServerHandle;
  let scratchRoot: string;
  let scratchStore: ScratchStore;

  beforeEach(async () => {
    harness = await startFakeUpstreamServer();
    scratchRoot = await mkdtemp(join(tmpdir(), "dds-sharing-runner-"));
    scratchStore = new ScratchStore(scratchRoot);
  });

  afterEach(async () => {
    await harness.close();
    await rm(scratchRoot, { recursive: true, force: true });
  });

  function runner(overrides: { stallTimeoutMs?: number; upstream?: UpstreamClient } = {}) {
    const upstreamClient =
      overrides.upstream ??
      new UpstreamClient({ baseUrl: harness.url, token: "test-token", retryBaseDelayMs: 1 });
    return new ExtractionRunner(
      upstreamClient,
      scratchStore,
      provinces,
      overrides.stallTimeoutMs,
    );
  }

  it("fetches every code ascending, filters nothing for a national Request, and checkpoints each code", async () => {
    const { events, onCodeFetched } = collectingEvents();

    const result = await runner().run(
      {
        requestId: "req-1",
        reportCodes: ["220", "202"],
        fromDate: "2026-01-01",
        toDate: "2026-01-08",
        areaProvinces: [],
      },
      { onCodeFetched },
    );

    expect(result.rows).toHaveLength(4); // two rows per default-fixture code
    expect(events.map((e) => e.groupCode)).toEqual(["202", "220"]); // ascending, not input order
    expect(await scratchStore.hasCheckpoint("req-1", "202")).toBe(true);
    expect(await scratchStore.hasCheckpoint("req-1", "220")).toBe(true);
  });

  it("excludes rows outside the Request's province list and counts an absent epidem_chw_code", async () => {
    // The default fixture's synthetic rows carry no epidem_chw_code at all
    // — every row is "absent", so a province-scoped Request excludes all of
    // them while still counting the absence.
    const { onCodeFetched } = collectingEvents();
    const result = await runner().run(
      {
        requestId: "req-2",
        reportCodes: ["202"],
        fromDate: "2026-01-01",
        toDate: "2026-01-08",
        areaProvinces: ["10"],
      },
      { onCodeFetched },
    );

    expect(result.rows).toHaveLength(0);
    expect(result.absentEpidemChwCodeCount).toBe(2);
  });

  it("resumes from a checkpoint without any upstream call for that code", async () => {
    await scratchStore.writeCheckpoint("req-3", "202", [
      { gender: "M" } as never,
    ]);
    const deadUpstream = new UpstreamClient({
      baseUrl: "http://127.0.0.1:1", // nothing listens here
      token: "test-token",
      retryBaseDelayMs: 1,
      timeoutMs: 50,
      maxAttempts: 1,
    });
    const { events, onCodeFetched } = collectingEvents();

    const result = await runner({ upstream: deadUpstream }).run(
      {
        requestId: "req-3",
        reportCodes: ["202"],
        fromDate: "2026-01-01",
        toDate: "2026-01-08",
        areaProvinces: [],
      },
      { onCodeFetched },
    );

    expect(result.rows).toEqual([{ gender: "M" }]);
    expect(events).toHaveLength(0); // nothing (re-)fetched, nothing to report
  });

  it("§7.5: fails with completeness_mismatch when rows received disagree with meta.total_items", async () => {
    const { onCodeFetched } = collectingEvents();

    const error = await runner()
      .run(
        {
          requestId: "req-4",
          reportCodes: [String(FAKE_UPSTREAM_SCENARIOS.shiftingTotalItems)],
          fromDate: "2026-01-01",
          toDate: "2026-01-08",
          areaProvinces: [],
        },
        { onCodeFetched },
      )
      .catch((e) => e);

    expect(error.failureCause).toBe("completeness_mismatch");
    // Nothing checkpointed for the mismatching code — "fail the job and
    // publish nothing" (§7.5).
    expect(
      await scratchStore.hasCheckpoint(
        "req-4",
        String(FAKE_UPSTREAM_SCENARIOS.shiftingTotalItems),
      ),
    ).toBe(false);
  });

  it("§7.6: fails with stall when no code completes within the (injected, short) stall window", async () => {
    const { onCodeFetched } = collectingEvents();

    const error = await runner({ stallTimeoutMs: 30 })
      .run(
        {
          requestId: "req-5",
          reportCodes: [String(FAKE_UPSTREAM_SCENARIOS.slowPage)],
          fromDate: "2026-01-01",
          toDate: "2026-01-08",
          areaProvinces: [],
        },
        { onCodeFetched },
      )
      .catch((e) => e);

    expect(error.failureCause).toBe("stall");
    expect(error.cause).toBeInstanceOf(StallError);
  }, Math.max(2000, SLOW_PAGE_DELAY_MS * 4));

  it("§5.5/§7.9: fails immediately on an auth rejection mid-job, classified auth_expiry", async () => {
    const { onCodeFetched } = collectingEvents();

    const error = await runner()
      .run(
        {
          requestId: "req-6",
          reportCodes: [String(FAKE_UPSTREAM_SCENARIOS.authExpiryMidJob)],
          fromDate: "2026-01-01",
          toDate: "2026-01-08",
          areaProvinces: [],
        },
        { onCodeFetched },
      )
      .catch((e) => e);

    expect(error.failureCause).toBe("auth_expiry");
  });

  describe("§17.1: no case data in a log, run through the full job", () => {
    const sentinel = "SENTINEL-JOB-1f9c4b2a-CASE-DATA";

    function fetchWithSentinel(): typeof fetch {
      return (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            "x-fixture-sentinel": sentinel,
          },
        });
    }

    it.each([
      ["500 mid-loop", FAKE_UPSTREAM_SCENARIOS.serverErrorMidLoop],
      ["truncated page", FAKE_UPSTREAM_SCENARIOS.truncatedPage],
      ["auth expiry mid-job", FAKE_UPSTREAM_SCENARIOS.authExpiryMidJob],
    ])("never logs or throws the planted sentinel on the %s path", async (_name, groupCode) => {
      const logger = spyLogger();
      const upstream = new UpstreamClient({
        baseUrl: harness.url,
        token: "test-token",
        retryBaseDelayMs: 1,
        logger,
        fetchFn: fetchWithSentinel(),
      });
      const { events, onCodeFetched } = collectingEvents();

      const outcome = await runner({ upstream })
        .run(
          {
            requestId: `req-log-${groupCode}`,
            reportCodes: [String(groupCode)],
            fromDate: "2026-01-01",
            toDate: "2026-01-08",
            areaProvinces: [],
          },
          { onCodeFetched },
        )
        .then((r) => ({ kind: "ok" as const, result: r }))
        .catch((error) => ({ kind: "error" as const, error }));

      expect(logger.lines.length).toBeGreaterThan(0);
      for (const line of logger.lines) {
        expect(line).not.toContain(sentinel);
      }
      for (const event of events) {
        expect(JSON.stringify(event)).not.toContain(sentinel);
      }
      if (outcome.kind === "error") {
        expect(outcome.error.message).not.toContain(sentinel);
        expect(String(outcome.error.stack)).not.toContain(sentinel);
      }
    });
  });
});
