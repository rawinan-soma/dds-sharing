import { describe, it, expect } from "vitest";
import { buildSpan } from "./span-builder.js";

describe("buildSpan", () => {
  it("keeps the inclusive from as the half-open start date", () => {
    expect(buildSpan({ from: "2026-03-01", to: "2026-03-10" }).startDate).toBe(
      "2026-03-01",
    );
  });

  it("adds one day to the inclusive to, producing an exclusive end date", () => {
    expect(buildSpan({ from: "2026-03-01", to: "2026-03-10" }).endDate).toBe(
      "2026-03-11",
    );
  });

  it("§17.1: an inclusive to of 31 Dec yields an exclusive end_date of 1 Jan", () => {
    expect(buildSpan({ from: "2026-01-01", to: "2026-12-31" }).endDate).toBe(
      "2027-01-01",
    );
  });

  it("rolls over a month boundary", () => {
    expect(buildSpan({ from: "2026-02-01", to: "2026-02-28" }).endDate).toBe(
      "2026-03-01",
    );
  });

  it("is pure: the same Request always produces byte-identical output", () => {
    const request = { from: "2026-06-15", to: "2026-06-15" };
    expect(buildSpan(request)).toEqual(buildSpan(request));
  });

  it("produces a one-day exclusive range for a single-day request", () => {
    expect(buildSpan({ from: "2026-06-15", to: "2026-06-15" })).toEqual({
      startDate: "2026-06-15",
      endDate: "2026-06-16",
    });
  });
});
