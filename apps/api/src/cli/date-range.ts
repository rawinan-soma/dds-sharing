import {
  buildSpan,
  daysBetween,
  isCalendarDay,
} from '../upstream/span-builder';

// The traffic report's date range. A person types the days as they read them
// on a Thai calendar, so the days are Asia/Bangkok (UTC+7, no daylight
// saving) and inclusive at both ends; the query gets a half-open instant range.
// The `+1` comes from the span builder, the one place allowed to hold it.

export interface InstantRange {
  start: Date;
  /** Exclusive. */
  end: Date;
}

export class DateRangeError extends Error {}

const bangkokMidnight = (day: string) => new Date(`${day}T00:00:00+07:00`);

export function parseBangkokDateRange(from: string, to: string): InstantRange {
  const notADay = [from, to].find((day): boolean => !isCalendarDay(day));
  if (notADay !== undefined) {
    throw new DateRangeError(
      `"${notADay}" is not a date in the form YYYY-MM-DD.`,
    );
  }
  if (daysBetween(from, to) < 0) {
    throw new DateRangeError(`--to ${to} is before --from ${from}.`);
  }
  const span = buildSpan({ from, to });
  return {
    start: bangkokMidnight(span.startDate),
    end: bangkokMidnight(span.endDate),
  };
}
