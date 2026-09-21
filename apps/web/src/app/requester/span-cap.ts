// The 365-day cap as the picker enforces it (spec §4.2): `to` may not be later
// than `from` + 365 days. The server re-checks the same rule and names it as
// upstream's; this is the first of the two places, and the only date arithmetic
// in the SPA — which is why the tripwire in the API's span-builder-only spec
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
