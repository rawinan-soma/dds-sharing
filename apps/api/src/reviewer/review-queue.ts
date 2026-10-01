import { requestExpiry } from '../clock/business-hours';

// The pending queue as the Reviewer sees it (spec §10.1). This is the pure part:
// given the pending rows and a clock reading, it says the order, how many are
// ahead of each, and which are past the 24-business-hour threshold. Nothing here
// is stored, so a Request that has slipped past the threshold is simply not
// actionable the next time anyone asks (§15.1).

export interface PendingRow {
  id: string;
  reference: string;
  submittedAt: Date;
}

export type Ranked<Row extends PendingRow> = Row & {
  expiresAt: Date;
  /** Whole minutes of business time left; zero once expired. */
  minutesLeft: number;
  /** Past 24 business hours: shown, but not actionable. */
  expired: boolean;
  /**
   * Actionable Requests submitted before this one — a count, never a duration
   * (§13.3). Null on an expired Request: it is not waiting in line for anyone.
   */
  ahead: number | null;
};

/** Oldest first, on the 24-business-hour clock. */
export function rankPending<Row extends PendingRow>(
  rows: readonly Row[],
  now: Date,
): Ranked<Row>[] {
  const ordered = rows.toSorted(
    (a, b) =>
      a.submittedAt.getTime() - b.submittedAt.getTime() ||
      a.reference.localeCompare(b.reference),
  );

  let actionable = 0;
  return ordered.map((row) => {
    const expiry = requestExpiry(row.submittedAt, now);
    const ahead = expiry.expired ? null : actionable++;
    return {
      ...row,
      expiresAt: expiry.expiresAt,
      minutesLeft: Math.ceil(expiry.hoursLeft * 60),
      expired: expiry.expired,
      ahead,
    };
  });
}
