import { describe, it, expect } from "vitest";
import {
  addBusinessHours,
  businessHoursBetween,
  formatBusinessHoursRemaining,
} from "./business-hours.js";

/** Parses an ICT (UTC+7) wall-clock instant. */
function ict(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe("businessHoursBetween", () => {
  it("counts only the overlap with the 08:30–16:30 window on a weekday", () => {
    expect(
      businessHoursBetween(
        ict("2026-09-08T09:00:00"), // a Tuesday
        ict("2026-09-08T11:00:00"),
      ),
    ).toBeCloseTo(2, 5);
  });

  it("clamps a span reaching before open and after close to exactly the window", () => {
    expect(
      businessHoursBetween(
        ict("2026-09-08T07:00:00"),
        ict("2026-09-08T18:00:00"),
      ),
    ).toBeCloseTo(8, 5);
  });

  it("a 02:00 Sunday submit starts counting at 08:30 Monday", () => {
    expect(
      businessHoursBetween(
        ict("2026-09-06T02:00:00"), // Sunday
        ict("2026-09-07T08:30:00"), // Monday, the moment it opens
      ),
    ).toBeCloseTo(0, 5);

    expect(
      businessHoursBetween(
        ict("2026-09-06T02:00:00"),
        ict("2026-09-07T09:00:00"),
      ),
    ).toBeCloseTo(0.5, 5);
  });

  it("skips the whole weekend between Friday close and Monday open", () => {
    expect(
      businessHoursBetween(
        ict("2026-09-04T16:00:00"), // Friday
        ict("2026-09-07T09:00:00"), // Monday
      ),
    ).toBeCloseTo(1, 5); // 16:00–16:30 Fri + 08:30–09:00 Mon
  });

  it("skips a checked-in holiday entirely, even though it falls on a weekday", () => {
    expect(
      businessHoursBetween(
        ict("2025-12-31T16:00:00"), // Wednesday
        ict("2026-01-02T09:00:00"), // Friday — Thursday 2026-01-01 is New Year's Day
      ),
    ).toBeCloseTo(1, 5); // 16:00–16:30 Wed + 08:30–09:00 Fri
  });

  it("returns 0 for a reversed or zero-length range, never negative", () => {
    const a = ict("2026-09-08T10:00:00");
    const b = ict("2026-09-08T09:00:00");
    expect(businessHoursBetween(a, b)).toBe(0);
    expect(businessHoursBetween(a, a)).toBe(0);
  });
});

describe("addBusinessHours", () => {
  it("adds within one open business day", () => {
    const due = addBusinessHours(ict("2026-09-08T08:30:00"), 8);
    expect(due.getTime()).toBe(ict("2026-09-08T16:30:00").getTime());
  });

  it("rolls a remainder over the weekend to Monday's open", () => {
    const due = addBusinessHours(ict("2026-09-04T16:00:00"), 1); // Friday
    expect(due.getTime()).toBe(ict("2026-09-07T09:00:00").getTime()); // Monday
  });

  it("rolls over a checked-in holiday", () => {
    const due = addBusinessHours(ict("2025-12-31T16:00:00"), 1); // Wednesday
    expect(due.getTime()).toBe(ict("2026-01-02T09:00:00").getTime()); // Friday, skipping the holiday
  });

  it("is the inverse of businessHoursBetween across a 24-business-hour decision window", () => {
    const submittedAt = ict("2026-09-08T10:20:00"); // a Tuesday
    const dueAt = addBusinessHours(submittedAt, 24);
    expect(businessHoursBetween(submittedAt, dueAt)).toBeCloseTo(24, 5);
  });
});

describe("formatBusinessHoursRemaining", () => {
  it("renders whole and partial hours as 'N h NN m left'", () => {
    expect(formatBusinessHoursRemaining(3.25)).toBe("3 h 15 m left");
    expect(formatBusinessHoursRemaining(1 / 60)).toBe("0 h 01 m left");
  });

  it("never reads as negative — zero or past due both read 'expired'", () => {
    expect(formatBusinessHoursRemaining(0)).toBe("expired");
    expect(formatBusinessHoursRemaining(-2)).toBe("expired");
  });
});
