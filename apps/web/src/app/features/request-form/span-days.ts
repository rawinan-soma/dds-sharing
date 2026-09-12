const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Inclusive day count between two YYYY-MM-DD dates, as the human made the
 * ask (spec §4.3) — mirrors apps/api/src/requests/span.ts's day-count math
 * so the picker's live readout and the 365-day cap check never disagree
 * with the server's.
 */
export function inclusiveDayCount(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
}
