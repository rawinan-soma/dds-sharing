// The 365-day cap as the picker enforces it (spec §4.2): `to` may not be later
// than `from` + 365 days. The server re-checks the same rule and names it as
// upstream's; this is the first of the two places, and the only date arithmetic
// in the SPA, the calendar's day stepping included — which is why the tripwire in the API's span-builder-only spec
// allows this file by name. It never computes upstream's half-open `end_date`;
// that conversion has one home, in the API.

const ONE_DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 365;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parse(day: string): number | null {
  if (!ISO_DAY.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The last day the picker offers for `to`, given `from`. */
export function latestTo(from: string): string {
  const start = parse(from);
  if (start === null) throw new Error(`Not a date: ${from}`);
  return format(start + MAX_SPAN_DAYS * ONE_DAY_MS);
}

/** The first day the picker offers for `from`, given `to`: the cap's mirror. */
export function earliestFrom(to: string): string {
  const end = parse(to);
  if (end === null) throw new Error(`Not a date: ${to}`);
  return format(end - MAX_SPAN_DAYS * ONE_DAY_MS);
}

/** The day `days` after (or before) `day`, for the calendar's arrow keys. */
export function shiftDay(day: string, days: number): string {
  const start = parse(day);
  if (start === null) throw new Error(`Not a date: ${day}`);
  return format(start + days * ONE_DAY_MS);
}

/** Every day of a month (1–12), as `YYYY-MM-DD`. */
export function daysOfMonth(year: number, month: number): string[] {
  const first = Date.UTC(year, month - 1, 1);
  const next = Date.UTC(year, month, 1);
  const days: string[] = [];
  for (let ms = first; ms < next; ms += ONE_DAY_MS) days.push(format(ms));
  return days;
}

export function exceedsCap(from: string, to: string): boolean {
  const start = parse(from);
  const end = parse(to);
  if (start === null || end === null) return false;
  return (end - start) / ONE_DAY_MS > MAX_SPAN_DAYS;
}

/** Days in the inclusive range, or null while it is incomplete or backwards. */
export function dayCount(from: string, to: string): number | null {
  const start = parse(from);
  const end = parse(to);
  if (start === null || end === null || end < start) return null;
  return (end - start) / ONE_DAY_MS + 1;
}
