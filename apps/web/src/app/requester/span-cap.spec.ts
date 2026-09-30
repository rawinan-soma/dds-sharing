import { describe, expect, it } from 'vitest';
import {
  dayCount,
  daysOfMonth,
  earliestFrom,
  exceedsCap,
  latestTo,
  shiftDay,
} from './span-cap';

describe('the 365-day cap', () => {
  it('lets `to` reach exactly from + 365 days, and no further', () => {
    expect(latestTo('2025-01-01')).toBe('2026-01-01');
  });

  it('crosses a leap day by the calendar', () => {
    expect(latestTo('2024-01-01')).toBe('2024-12-31');
    expect(latestTo('2023-03-01')).toBe('2024-02-29');
  });

  it('agrees with the server: 365 is allowed, 366 is not', () => {
    expect(exceedsCap('2025-01-01', '2026-01-01')).toBe(false);
    expect(exceedsCap('2025-01-01', '2026-01-02')).toBe(true);
  });

  it('is not exceeded by an empty or partial range', () => {
    expect(exceedsCap('', '2026-01-01')).toBe(false);
    expect(exceedsCap('2025-01-01', '')).toBe(false);
  });

  it('counts the days of an inclusive range as the human reads it', () => {
    expect(dayCount('2025-01-01', '2025-01-31')).toBe(31);
    expect(dayCount('2025-01-01', '2025-01-01')).toBe(1);
  });

  it('has no day count for a range that is not complete or is backwards', () => {
    expect(dayCount('', '2025-01-01')).toBeNull();
    expect(dayCount('2025-01-02', '2025-01-01')).toBeNull();
  });
});

describe("the calendar's day arithmetic", () => {
  it('bounds `from` by the mirror of the cap once `to` is set', () => {
    expect(earliestFrom('2026-01-01')).toBe('2025-01-01');
    expect(exceedsCap(earliestFrom('2024-12-31'), '2024-12-31')).toBe(false);
  });

  it('steps by days across months and years', () => {
    expect(shiftDay('2025-01-31', 1)).toBe('2025-02-01');
    expect(shiftDay('2025-01-01', -1)).toBe('2024-12-31');
    expect(shiftDay('2025-03-01', 7)).toBe('2025-03-08');
  });

  it('lists every day of a month, leap February included', () => {
    expect(daysOfMonth(2024, 2)).toHaveLength(29);
    expect(daysOfMonth(2025, 2)).toHaveLength(28);
    expect(daysOfMonth(2025, 5)[0]).toBe('2025-05-01');
    expect(daysOfMonth(2025, 5).at(-1)).toBe('2025-05-31');
  });
});
