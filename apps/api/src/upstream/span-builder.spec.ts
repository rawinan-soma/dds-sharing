import { describe, expect, it } from 'vitest';
import { buildSpan, daysBetween, isCalendarDay } from './span-builder';

describe('buildSpan', () => {
  it('turns an inclusive `to` of 31 Dec into an exclusive end_date of 1 Jan', () => {
    expect(buildSpan({ from: '2025-12-01', to: '2025-12-31' })).toEqual({
      startDate: '2025-12-01',
      endDate: '2026-01-01',
    });
  });

  it('keeps a single-day Request non-empty', () => {
    expect(buildSpan({ from: '2026-03-05', to: '2026-03-05' })).toEqual({
      startDate: '2026-03-05',
      endDate: '2026-03-06',
    });
  });

  it('carries across a month end and a leap day', () => {
    expect(buildSpan({ from: '2024-02-01', to: '2024-02-29' }).endDate).toBe(
      '2024-03-01',
    );
    expect(buildSpan({ from: '2025-02-01', to: '2025-02-28' }).endDate).toBe(
      '2025-03-01',
    );
  });

  it('does not depend on the host time zone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Asia/Bangkok', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = tz;
        expect(
          buildSpan({ from: '2026-03-28', to: '2026-03-29' }).endDate,
        ).toBe('2026-03-30');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('gives the same span for the same Request every time', () => {
    const request = { from: '2025-08-27', to: '2026-08-26' };
    expect(buildSpan(request)).toEqual(buildSpan({ ...request }));
  });

  it('rejects a date that is not a real calendar day', () => {
    expect(() => buildSpan({ from: '2025-01-01', to: '2025-02-30' })).toThrow();
    expect(() => buildSpan({ from: '01/01/2025', to: '2025-01-31' })).toThrow();
  });
});

describe('daysBetween', () => {
  it('counts the difference of two inclusive human dates', () => {
    expect(daysBetween('2025-01-01', '2025-01-31')).toBe(30);
    expect(daysBetween('2025-01-01', '2025-01-01')).toBe(0);
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('is negative when `to` is before `from`', () => {
    expect(daysBetween('2025-01-02', '2025-01-01')).toBe(-1);
  });
});

describe('isCalendarDay', () => {
  it('accepts real days and nothing else', () => {
    expect(isCalendarDay('2024-02-29')).toBe(true);
    for (const bad of [
      '2025-02-29',
      '2025-1-1',
      '',
      null,
      undefined,
      20250101,
    ]) {
      expect(isCalendarDay(bad)).toBe(false);
    }
  });
});
