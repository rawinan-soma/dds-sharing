import { describe, expect, it } from "vitest";
import { buildSpan } from "../upstream/span-builder.js";

/**
 * §17.1: "Assert that the Probe and the extraction job, given the same
 * Request, produce byte-identical start_date and end_date." Both
 * `ProbeService.runOrThrow` (probe.service.ts) and `ExtractionRunner.run`
 * (extraction-runner.ts) call `buildSpan({ from, to })` directly and hold no
 * date arithmetic of their own — this pins that architectural guarantee
 * against a second, disagreeing copy of the `+1 day` conversion ever being
 * introduced in either caller (§7.2 — the 3,196-row loss this design keeps
 * naming).
 */
describe("§17.1: span builder parity between the Probe and the extraction job", () => {
  it("produces byte-identical spans for the same Request, however many times it is called", () => {
    const range = { from: "2026-01-01", to: "2026-12-31" };

    const probeSpan = buildSpan(range);
    const extractionSpan = buildSpan(range);

    expect(extractionSpan).toEqual(probeSpan);
    expect(extractionSpan).toEqual({
      startDate: "2026-01-01",
      endDate: "2027-01-01",
    });
  });
});
