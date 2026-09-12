import { describe, it, expect } from "vitest";
import { buddhistYearOf, formatReferenceNumber } from "./reference-number.js";

describe("formatReferenceNumber", () => {
  it("pads the counter to four digits", () => {
    expect(formatReferenceNumber(2569, 142)).toBe("REQ-2569-0142");
    expect(formatReferenceNumber(2569, 1)).toBe("REQ-2569-0001");
  });

  it("does not truncate a counter past 9999", () => {
    expect(formatReferenceNumber(2569, 10000)).toBe("REQ-2569-10000");
  });
});

describe("buddhistYearOf", () => {
  it("adds 543 to the Gregorian year", () => {
    expect(buddhistYearOf(new Date("2026-06-15T12:00:00Z"))).toBe(2569);
  });

  it("uses the Bangkok-local (UTC+7) date, not the UTC one", () => {
    // 2026-12-31T18:00:00Z is already 2027-01-01 01:00 in Bangkok.
    expect(buddhistYearOf(new Date("2026-12-31T18:00:00Z"))).toBe(2570);
    // 2026-12-31T16:00:00Z is still 2026-12-31 23:00 in Bangkok.
    expect(buddhistYearOf(new Date("2026-12-31T16:00:00Z"))).toBe(2569);
  });
});
