import { describe, expect, it } from "vitest";
import { buildProvinceLookup, resolveHealthZone } from "./epidem-health-zone.js";

const provinces = buildProvinceLookup([
  { provinceId: "10", healthRegion: 4 },
  { provinceId: "50", healthRegion: 1 },
]);

describe("resolveHealthZone", () => {
  it("resolves a known province code to its health region", () => {
    expect(resolveHealthZone("50", provinces)).toEqual({
      value: 1,
      kind: "ok",
    });
  });

  it("normalises a JSON-number epidem_chw_code before looking it up", () => {
    expect(resolveHealthZone(10, provinces)).toEqual({ value: 4, kind: "ok" });
  });

  it("is blank, kind 'absent', when epidem_chw_code is missing — a gap in the source", () => {
    expect(resolveHealthZone(null, provinces)).toEqual({
      value: null,
      kind: "absent",
    });
    expect(resolveHealthZone(undefined, provinces)).toEqual({
      value: null,
      kind: "absent",
    });
  });

  it("is blank, kind 'unmapped', for a code outside the 77 — the table is stale, not the source", () => {
    expect(resolveHealthZone("99", provinces)).toEqual({
      value: null,
      kind: "unmapped",
    });
  });
});
