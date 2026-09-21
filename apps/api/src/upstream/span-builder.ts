// The single function turning a Request into the half-open date range the
// service asks upstream for: `[from, to + 1 day)`. The human's `to` is
// inclusive; upstream's `end_date` is exclusive.
//
// This is the ONLY place in the codebase that performs that conversion. The
// Probe and the extraction job both call it, so they cannot disagree about which
// days they covered — a second copy of this `+1` is how 3,196 rows were once
// lost (spec §4.3, §7.2). The `+1` must never appear in the UI, the CSV, the
// audit record or the stored Request, and the API client sends the span verbatim.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RequestDates {
  /** Inclusive first day, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive last day, `YYYY-MM-DD`. */
  to: string;
}

export interface Span {
  /** Inclusive, `YYYY-MM-DD`: upstream's `start_date`. */
  startDate: string;
  /** EXCLUSIVE, `YYYY-MM-DD`: upstream's `end_date`. */
  endDate: string;
}

function parseDay(day: string): number {
  if (!ISO_DAY.test(day)) {
    throw new Error(`Not a YYYY-MM-DD date: ${day}`);
  }
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    throw new Error(`Not a real calendar day: ${day}`);
  }
  return ms;
}

export function buildSpan({ from, to }: RequestDates): Span {
  const startMs = parseDay(from);
  const endMs = parseDay(to) + ONE_DAY_MS;
  return {
    startDate: new Date(startMs).toISOString().slice(0, 10),
    endDate: new Date(endMs).toISOString().slice(0, 10),
  };
}
