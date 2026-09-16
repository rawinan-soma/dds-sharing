import { describe, expect, it } from "vitest";
import { matchesAreaFilter } from "./filter.js";

describe("matchesAreaFilter", () => {
  it("includes everything for a national Request (empty province list)", () => {
    expect(matchesAreaFilter("10", [])).toEqual({
      included: true,
      absent: false,
    });
  });

  it("matches a province code against the stored list", () => {
    expect(matchesAreaFilter("10", ["10"])).toEqual({
      included: true,
      absent: false,
    });
    expect(matchesAreaFilter("11", ["10"])).toEqual({
      included: false,
      absent: false,
    });
  });

  it("matches any province in a region's expanded list", () => {
    expect(matchesAreaFilter("12", ["10", "11", "12"])).toEqual({
      included: true,
      absent: false,
    });
  });

  it("normalises a JSON-number epidem_chw_code to string before comparing", () => {
    expect(matchesAreaFilter(10, ["10"])).toEqual({
      included: true,
      absent: false,
    });
  });

  it("excludes a missing epidem_chw_code from a province/region filter, and counts it absent", () => {
    expect(matchesAreaFilter(null, ["10"])).toEqual({
      included: false,
      absent: true,
    });
  });

  it("still includes a missing epidem_chw_code for a national Request, but still counts it absent", () => {
    expect(matchesAreaFilter(undefined, [])).toEqual({
      included: true,
      absent: true,
    });
  });
});
