import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UpstreamClient } from "./upstream-client.js";
import {
  UpstreamAuthError,
  UpstreamMalformedResponseError,
  UpstreamProbeExhaustedError,
  UpstreamRetriesExhaustedError,
  UpstreamTimeoutError,
} from "./upstream-client-errors.js";
import {
  FAKE_UPSTREAM_SCENARIOS,
  SLOW_PAGE_DELAY_MS,
  startFakeUpstreamServer,
  type FakeUpstreamServerHandle,
} from "./fake-harness/fake-upstream-server.js";
import type { UpstreamLogger } from "./upstream-client.types.js";

function spyLogger(): UpstreamLogger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logCall: (fields) => lines.push(JSON.stringify(fields)),
    logError: (fields) => lines.push(JSON.stringify(fields)),
  };
}

describe("UpstreamClient against the fake upstream harness", () => {
  let harness: FakeUpstreamServerHandle;

  beforeEach(async () => {
    harness = await startFakeUpstreamServer();
  });

  afterEach(async () => {
    await harness.close();
  });

  function client(
    overrides: { timeoutMs?: number; logger?: UpstreamLogger } = {},
  ) {
    return new UpstreamClient({
      baseUrl: harness.url,
      token: "test-token",
      retryBaseDelayMs: 1,
      ...overrides,
    });
  }

  it("fetches a two-page happy-path group end to end", async () => {
    const result = await client().fetchDiseaseGroup({
      groupCode: 209,
      startDate: "2026-01-01",
      endDate: "2026-01-08",
    });

    expect(result.rows).toHaveLength(2);
    expect(result.totalItems).toBe(2);
    expect(result.calls).toHaveLength(2);
  });

  it("recovers from a 500 mid-loop within the 3-attempt retry budget", async () => {
    const result = await client().fetchDiseaseGroup({
      groupCode: FAKE_UPSTREAM_SCENARIOS.serverErrorMidLoop,
      startDate: "2026-01-01",
      endDate: "2026-01-08",
    });

    expect(result.rows).toHaveLength(2);
  });

  it(
    "treats a slow page as a retryable client timeout",
    async () => {
      const error = await client({ timeoutMs: 20 })
        .fetchDiseaseGroup({
          groupCode: FAKE_UPSTREAM_SCENARIOS.slowPage,
          startDate: "2026-01-01",
          endDate: "2026-01-08",
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UpstreamRetriesExhaustedError);
      expect(error.lastError).toBeInstanceOf(UpstreamTimeoutError);
    },
    Math.max(2000, SLOW_PAGE_DELAY_MS * 6),
  );

  it("treats a truncated page as a retryable parse failure, never a silent success", async () => {
    const error = await client()
      .fetchDiseaseGroup({
        groupCode: FAKE_UPSTREAM_SCENARIOS.truncatedPage,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(UpstreamRetriesExhaustedError);
    expect(error.lastError).toBeInstanceOf(UpstreamMalformedResponseError);
  });

  it("fails an auth expiry mid-job immediately, spending none of the retry budget", async () => {
    const logger = spyLogger();
    const error = await client({ logger })
      .fetchDiseaseGroup({
        groupCode: FAKE_UPSTREAM_SCENARIOS.authExpiryMidJob,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(UpstreamAuthError);
    // One successful call logged for page 1, one error logged for page 2 — no retry attempts.
    expect(logger.lines).toHaveLength(2);
  });

  it("discards and restarts from page 1 when total_items shifts, then completes", async () => {
    const result = await client().fetchDiseaseGroup({
      groupCode: FAKE_UPSTREAM_SCENARIOS.shiftingTotalItems,
      startDate: "2026-01-01",
      endDate: "2026-01-08",
    });

    expect(result.totalItems).toBe(7);
    expect(result.rows).toHaveLength(2);
  });

  describe("probeDiseaseGroup against the fake harness (§5.4)", () => {
    it("makes exactly one call to the default fixture and reads its total_items", async () => {
      const result = await client().probeDiseaseGroup({
        groupCode: 202,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
      });

      expect(result.totalItems).toBe(2);
      expect(result.callsMade).toBe(1);
      expect(result.requestIds).toHaveLength(1);
      expect(result.requestIds[0]).toBeDefined();
    });

    it("retries a 500 on page 1 once, then succeeds, keeping both calls' x-request-ids", async () => {
      const result = await client().probeDiseaseGroup({
        groupCode: FAKE_UPSTREAM_SCENARIOS.probeRetryThenSucceed,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
      });

      expect(result.totalItems).toBe(3);
      expect(result.callsMade).toBe(2);
      // The failed first attempt's id must survive alongside the successful
      // retry's — accountability (§5.4) covers every call spent, not just
      // the one that ended it.
      expect(result.requestIds).toHaveLength(2);
      expect(result.requestIds[0]).toBeDefined();
      expect(result.requestIds[1]).toBeDefined();
      expect(new Set(result.requestIds).size).toBe(2);
    });

    it("abandons after 3 attempts against a page that always truncates", async () => {
      const error = await client()
        .probeDiseaseGroup({
          groupCode: FAKE_UPSTREAM_SCENARIOS.truncatedPage,
          startDate: "2026-01-01",
          endDate: "2026-01-08",
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UpstreamProbeExhaustedError);
      expect(error.attempts).toHaveLength(3);
      for (const attempt of error.attempts) {
        expect(attempt.errorKind).toBe("malformed_response");
      }
    });
  });

  describe("§17.1: no case data in a log", () => {
    const sentinel = "SENTINEL-1f9c4b2a-CASE-DATA";

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
    ])(
      "never logs the planted sentinel on the %s path",
      async (_name, groupCode) => {
        const logger = spyLogger();
        const upstream = new UpstreamClient({
          baseUrl: harness.url,
          token: "test-token",
          retryBaseDelayMs: 1,
          logger,
          fetchFn: fetchWithSentinel(),
        });

        await upstream
          .fetchDiseaseGroup({
            groupCode,
            startDate: "2026-01-01",
            endDate: "2026-01-08",
          })
          .catch(() => {});

        expect(logger.lines.length).toBeGreaterThan(0);
        for (const line of logger.lines) {
          expect(line).not.toContain(sentinel);
        }
      },
    );
  });
});
