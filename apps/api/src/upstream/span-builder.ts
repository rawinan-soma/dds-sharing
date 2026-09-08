export interface RequestDateRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
}

export interface UpstreamSpan {
  /** Inclusive, YYYY-MM-DD — sent upstream as `start_date`. */
  startDate: string;
  /** Exclusive, YYYY-MM-DD — sent upstream as `end_date`. */
  endDate: string;
}

/**
 * Turns a Request's inclusive date range into the half-open range upstream
 * expects: `[from, to + 1 day)`. This is the only place in the codebase that
 * performs this conversion — the Probe and the extraction job both call it,
 * so the two can never disagree about which days they covered (§4.3, §7.2).
 */
export function buildSpan(range: RequestDateRange): UpstreamSpan {
  const exclusiveEnd = new Date(`${range.to}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);

  return {
    startDate: range.from,
    endDate: exclusiveEnd.toISOString().slice(0, 10),
  };
}
