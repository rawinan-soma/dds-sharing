import { describe, expect, it, vi } from "vitest";
import * as spanBuilder from "../upstream/span-builder.js";
import type { AppDb } from "../db/app-db.module.js";
import { ProbeService } from "../probe/probe.service.js";
import type { UpstreamClient } from "../upstream/upstream-client.js";
import { ExtractionRunner } from "./extraction-runner.js";
import type { ScratchStore } from "./scratch-store.js";

const RANGE = { from: "2026-01-01", to: "2026-12-31" };
const EXPECTED_SPAN = { startDate: "2026-01-01", endDate: "2027-01-01" };

function stubUpstreamClient(rejectWith: Error): UpstreamClient {
  return {
    probeDiseaseGroup: vi.fn().mockRejectedValue(rejectWith),
    fetchDiseaseGroup: vi.fn().mockRejectedValue(rejectWith),
  } as unknown as UpstreamClient;
}

/**
 * §17.1: "Assert that the Probe and the extraction job, given the same
 * Request, produce byte-identical start_date and end_date." Rather than
 * calling `buildSpan` directly (which only pins the function itself — see
 * `span-builder.spec.ts`'s own purity test), this drives each real caller —
 * `ProbeService.run` and `ExtractionRunner.run` — through a spy on the
 * shared module, so a second, disagreeing copy of the `+1 day` conversion
 * introduced in either caller would fail this test (§7.2 — the 3,196-row
 * loss this design keeps naming).
 */
describe("§17.1: span builder parity between the Probe and the extraction job", () => {
  it("both real callers invoke the one shared buildSpan with byte-identical results", async () => {
    const spy = vi.spyOn(spanBuilder, "buildSpan");

    const probeService = new ProbeService(
      { db: {} } as unknown as AppDb,
      stubUpstreamClient(new Error("stub: never reaches the network")),
    );
    // ProbeService.run never rejects (§5.4) — it swallows every failure.
    await probeService.run({
      requestId: "req-parity-probe",
      reportCodes: ["202"],
      ...RANGE,
    });

    const extractionRunner = new ExtractionRunner(
      stubUpstreamClient(new Error("stub: never reaches the network")),
      { hasCheckpoint: async () => false } as unknown as ScratchStore,
      new Map(),
    );
    await extractionRunner
      .run(
        {
          requestId: "req-parity-extraction",
          reportCodes: ["202"],
          areaProvinces: [],
          fromDate: RANGE.from,
          toDate: RANGE.to,
        },
        { onCodeFetched: () => {} },
      )
      .catch(() => {}); // the stub upstream client always rejects — only the span call matters here

    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.results) {
      expect(call.value).toEqual(EXPECTED_SPAN);
    }
  });
});
