import { describe, expect, it } from 'vitest';
import { formatBeDate, parseBeDate } from './be-date';

describe('a date typed in the Buddhist era', () => {
  it('reads day/month/year with slashes or dashes, padded or not', () => {
    expect(parseBeDate('1/3/2569')).toBe('2026-03-01');
    expect(parseBeDate('01-03-2569')).toBe('2026-03-01');
    expect(parseBeDate(' 31/5/2568 ')).toBe('2025-05-31');
  });

  it('reads its own at-rest form back, so the shown value is editable as it stands', () => {
    expect(parseBeDate('1 มี.ค. 2569')).toBe('2026-03-01');
    expect(parseBeDate(formatBeDate('2025-12-31'))).toBe('2025-12-31');
  });

  it('reads the full month name too', () => {
    expect(parseBeDate('31 พฤษภาคม 2568')).toBe('2025-05-31');
  });

  it('reads a year below 2400 as the Common Era', () => {
    expect(parseBeDate('1/3/2026')).toBe('2026-03-01');
  });

  it('refuses a day that is not on the calendar', () => {
    expect(parseBeDate('31/2/2569')).toBeNull();
    expect(parseBeDate('29/2/2568')).toBeNull();
    expect(parseBeDate('29/2/2567')).toBe('2024-02-29');
    expect(parseBeDate('1/13/2569')).toBeNull();
    expect(parseBeDate('0/1/2569')).toBeNull();
  });

  it('refuses what is not a date', () => {
    expect(parseBeDate('')).toBeNull();
    expect(parseBeDate('2026-03-01')).toBeNull();
    expect(parseBeDate('1/3/69')).toBeNull();
    expect(parseBeDate('1 มีนา 2569')).toBeNull();
  });
});

describe('a stored date shown at rest', () => {
  it('is day, short Thai month and Buddhist year', () => {
    expect(formatBeDate('2026-03-01')).toBe('1 มี.ค. 2569');
    expect(formatBeDate('2025-05-31')).toBe('31 พ.ค. 2568');
  });
});
