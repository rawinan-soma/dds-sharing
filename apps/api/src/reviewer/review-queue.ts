import { type Holidays, requestExpiry } from '../clock/business-hours';

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
  holidays: Holidays,
): Ranked<Row>[] {
  const ordered = rows.toSorted(
    (a, b) =>
      a.submittedAt.getTime() - b.submittedAt.getTime() ||
      a.reference.localeCompare(b.reference),
  );

  let actionable = 0;
  return ordered.map((row) => {
    const expiry = requestExpiry(row.submittedAt, now, holidays);
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

export interface ProvinceName {
  provinceId: string;
  nameTh: string;
  healthRegion: number;
}

export type Area =
  | { kind: 'national' }
  | {
      kind: 'provinces';
      provinces: { id: string; name: string }[];
      /** Set only when the provinces are exactly one health region's whole set. */
      region: number | null;
    };

/**
 * The area in the Reviewer's terms. A Request stores provinces and never a
 * region (§4.4), so a region is recognised here rather than remembered.
 */
export function describeArea(
  stored: readonly string[],
  lookup: readonly ProvinceName[],
): Area {
  if (stored.length === 0) return { kind: 'national' };

  const names = new Map(lookup.map((p) => [p.provinceId, p]));
  const provinces = stored
    .toSorted()
    .map((id) => ({ id, name: names.get(id)?.nameTh ?? id }));

  const regions = new Set(stored.map((id) => names.get(id)?.healthRegion));
  const [only] = regions;
  const whole =
    regions.size === 1 &&
    only !== undefined &&
    stored.length > 1 &&
    lookup.filter((p) => p.healthRegion === only).length === stored.length;

  return { kind: 'provinces', provinces, region: whole ? only : null };
}
