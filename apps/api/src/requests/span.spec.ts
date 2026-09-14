import { describe, it, expect } from "vitest";
import { validateSpan } from "./span.js";

describe("validateSpan (§4.2)", () => {
  it("accepts an inclusive range and reports the human day count", () => {
    expect(validateSpan("2026-01-01", "2026-01-31")).toEqual({
      ok: true,
      days: 31,
    });
  });

  it("accepts a single day as a 1-day span", () => {
    expect(validateSpan("2026-01-01", "2026-01-01")).toEqual({
      ok: true,
      days: 1,
    });
  });

  it("accepts exactly 365 inclusive days", () => {
    // 2026-01-01 .. 2026-12-31 is 365 days inclusive (2026 is not a leap year).
    expect(validateSpan("2026-01-01", "2026-12-31")).toEqual({
      ok: true,
      days: 365,
    });
  });

  it("rejects a 366-day span, never splitting it", () => {
    const result = validateSpan("2026-01-01", "2027-01-01");
    expect(result.ok).toBe(false);
    expect(result.days).toBe(366);
  });

  it("rejects an inverted range", () => {
    const result = validateSpan("2026-01-31", "2026-01-01");
    expect(result.ok).toBe(false);
  });
});
