import { type Holidays, nextOpening } from '../reviewer/business-hours';

const HOUR_MS = 60 * 60 * 1000;

/** The silence that trips the wire, in wall-clock hours (§11.4). */
export const COLLECTION_LAPSE_WALL_CLOCK_HOURS = 24;

export interface CollectionLapse {
  /** When the silence became a lapse: 24 wall-clock hours after the Delivery. */
  tripsAt: Date;
  /** When the Alert may be raised: the trip itself, or the next opening after it. */
  raisesAt: Date;
  /** From the Delivery to `raisesAt` — above 24 means the Alert waited for an opening. */
  wallClockHoursElapsed: number;
}

// Two clocks, doing two different jobs (§11.4, ADR 0011). The trip-wire is
// WALL-CLOCK, because the Download token it warns about expires in wall-clock
// hours: a clock that stops cannot warn you about one that does not. Only the
// raising of the Alert waits for business hours, because it is a call on a
// Reviewer's attention and asking for that on a Saturday is asking nobody.
//
// ⚠️ Do not re-unify the two. Measuring the lapse in business hours is the
// natural-looking simplification and it is a defect: 24 business hours are 72
// wall-clock hours on a weekend-free week — the token's whole life.
export function collectionLapse(
  deliveredAt: Date,
  holidays: Holidays,
): CollectionLapse {
  const tripsAt = new Date(
    deliveredAt.getTime() + COLLECTION_LAPSE_WALL_CLOCK_HOURS * HOUR_MS,
  );
  const raisesAt = nextOpening(tripsAt, holidays);
  return {
    tripsAt,
    raisesAt,
    wallClockHoursElapsed:
      (raisesAt.getTime() - deliveredAt.getTime()) / HOUR_MS,
  };
}
