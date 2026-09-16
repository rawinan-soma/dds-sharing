import { describe, expect, it } from "vitest";
import { computeOnsetAge } from "./onset-age.js";

const NOW = new Date("2026-06-15T00:00:00.000Z");

describe("computeOnsetAge", () => {
  it("computes completed years at onset_date, not at submission or today", () => {
    expect(
      computeOnsetAge("2000-01-01", "2020-06-14", NOW),
    ).toEqual({ value: 20, impossible: false });
    expect(
      computeOnsetAge("2000-01-01", "2020-06-15", NOW),
    ).toEqual({ value: 20, impossible: false });
  });

  it("has not yet had this year's birthday at onset — one year less", () => {
    expect(
      computeOnsetAge("2000-07-01", "2020-06-30", NOW),
    ).toEqual({ value: 19, impossible: false });
  });

  it("is blank, not counted impossible, when birth_date is absent — even though age_y might exist upstream", () => {
    expect(computeOnsetAge(null, "2020-06-15", NOW)).toEqual({
      value: null,
      impossible: false,
    });
  });

  it("is blank, not counted impossible, when onset_date is absent", () => {
    expect(computeOnsetAge("2000-01-01", null, NOW)).toEqual({
      value: null,
      impossible: false,
    });
  });

  it("is blank and counted impossible when onset_date precedes birth_date", () => {
    expect(
      computeOnsetAge("2020-06-15", "2000-01-01", NOW),
    ).toEqual({ value: null, impossible: true });
  });

  it("is blank and counted impossible for a future birth_date", () => {
    expect(
      computeOnsetAge("2030-01-01", "2030-06-01", NOW),
    ).toEqual({ value: null, impossible: true });
  });

  it("is blank and counted impossible for an age over 120", () => {
    expect(
      computeOnsetAge("1800-01-01", "2020-01-01", NOW),
    ).toEqual({ value: null, impossible: true });
  });

  it("is blank and counted impossible for an unparseable date", () => {
    expect(
      computeOnsetAge("not-a-date", "2020-01-01", NOW),
    ).toEqual({ value: null, impossible: true });
  });
});
