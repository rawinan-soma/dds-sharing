const MAX_SPAN_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SpanValidation {
  ok: boolean;
  /** Inclusive day count, as the human made the ask (§4.3) — never upstream's half-open count. */
  days: number;
}

/**
 * A Request's date range is inclusive to the human (§4.3) and capped at 365
 * days (§4.2) — a span limit (`end - start <= 365 days`), not an absolute
 * floor. An inverted range and an over-span range are both rejected, never
 * split — a caller wanting a wider window submits two Requests.
 */
export function validateSpan(from: string, to: string): SpanValidation {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days =
    Math.round((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;

  return { ok: days >= 1 && days <= MAX_SPAN_DAYS, days };
}
