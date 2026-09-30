import { daysOfMonth, earliestFrom, latestTo } from './span-cap';

// The พ.ศ. calendar popover's model (docs/design/system.md "Date field"). The
// other end of the range bounds the grid, so the picker can never produce a
// range over the cap. Days are ISO strings and compare as strings.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One end of the date range. */
export type RangeEnd = 'from' | 'to';

/** Both ends as stored: ISO days, or '' while unset. */
export interface DateRange {
  from: string;
  to: string;
}

export interface Bounds {
  min: string | null;
  max: string | null;
}

/** The days the picker for one end may offer, given both ends as stored. */
export function pickerBounds(end: RangeEnd, from: string, to: string): Bounds {
  if (end === 'to') {
    return ISO_DAY.test(from)
      ? { min: from, max: latestTo(from) }
      : { min: null, max: null };
  }
  return ISO_DAY.test(to)
    ? { min: earliestFrom(to), max: to }
    : { min: null, max: null };
}

export interface CalendarDay {
  iso: string;
  day: number;
  disabled: boolean;
  chosen: boolean;
  inRange: boolean;
  today: boolean;
}

export interface CalendarMonth {
  /** Empty cells before the 1st, Sunday first. */
  lead: number;
  days: CalendarDay[];
}

export interface MonthMarks extends Bounds, DateRange {
  chosen: string;
  today: string;
}

export function calendarMonth(
  year: number,
  month: number,
  marks: MonthMarks,
): CalendarMonth {
  const days = daysOfMonth(year, month);
  const { min, max, from, to, chosen, today } = marks;
  const ranged = Boolean(from && to && from <= to);
  return {
    lead: new Date(`${days[0]}T00:00:00Z`).getUTCDay(),
    days: days.map((iso, i) => ({
      iso,
      day: i + 1,
      disabled: (min !== null && iso < min) || (max !== null && iso > max),
      chosen: iso === chosen,
      inRange: ranged && iso >= from && iso <= to,
      today: iso === today,
    })),
  };
}
