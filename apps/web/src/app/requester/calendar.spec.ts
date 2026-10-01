import { describe, expect, it } from 'vitest';
import { calendarMonth, pickerBounds } from './calendar';

describe('the bounds the picker offers', () => {
  it('lets `to` run from `from` to from + 364, and nothing before or past it', () => {
    expect(pickerBounds('to', { from: '2025-01-01', to: '' })).toEqual({
      min: '2025-01-01',
      max: '2025-12-31',
    });
  });

  it('mirrors the cap under `from` once `to` is set', () => {
    expect(pickerBounds('from', { from: '', to: '2026-01-01' })).toEqual({
      min: '2025-01-02',
      max: '2026-01-01',
    });
  });

  it('is open while the other end is empty or unreadable', () => {
    expect(pickerBounds('to', { from: '', to: '' })).toEqual({
      min: null,
      max: null,
    });
    expect(pickerBounds('from', { from: '', to: '' })).toEqual({
      min: null,
      max: null,
    });
  });
});

describe('a month of the calendar', () => {
  const may = calendarMonth(2025, 5, {
    min: '2025-03-01',
    max: '2025-05-20',
    from: '2025-03-01',
    to: '2025-05-10',
    chosen: '2025-05-10',
    today: '2025-05-15',
  });
  const day = (iso: string) => may.days.find((d) => d.iso === iso)!;

  it('starts on its weekday, Sunday first', () => {
    // 1 May 2025 is a Thursday.
    expect(may.lead).toBe(4);
    expect(may.days).toHaveLength(31);
  });

  it('marks the chosen day, the range between and today', () => {
    expect(day('2025-05-10')).toMatchObject({ chosen: true, inRange: true });
    expect(day('2025-05-01')).toMatchObject({ chosen: false, inRange: true });
    expect(day('2025-05-11').inRange).toBe(false);
    expect(day('2025-05-15').today).toBe(true);
  });

  it('disables every day outside the bounds', () => {
    expect(day('2025-05-20').disabled).toBe(false);
    expect(day('2025-05-21').disabled).toBe(true);
  });
});
