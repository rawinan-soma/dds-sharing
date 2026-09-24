import { describe, expect, it } from 'vitest';
import { parseBangkokDateRange } from './date-range';

describe('parseBangkokDateRange', () => {
  it('takes inclusive Bangkok days and returns a half-open instant range', () => {
    const range = parseBangkokDateRange('2026-03-01', '2026-03-31');
    expect(range).toEqual({
      start: new Date('2026-02-28T17:00:00.000Z'),
      end: new Date('2026-03-31T17:00:00.000Z'),
    });
  });

  it('accepts a single day', () => {
    const range = parseBangkokDateRange('2026-03-01', '2026-03-01');
    expect(range).toEqual({
      start: new Date('2026-02-28T17:00:00.000Z'),
      end: new Date('2026-03-01T17:00:00.000Z'),
    });
  });

  it.each([
    ['2026-3-01', '2026-03-31'],
    ['2026-02-30', '2026-03-31'],
    ['2026-03-01', 'yesterday'],
  ])('refuses a date that is not a real YYYY-MM-DD (%s, %s)', (from, to) => {
    expect(() => parseBangkokDateRange(from, to)).toThrow(/YYYY-MM-DD/);
  });

  it('refuses a range that ends before it starts', () => {
    expect(() => parseBangkokDateRange('2026-03-02', '2026-03-01')).toThrow(
      /before/,
    );
  });
});
