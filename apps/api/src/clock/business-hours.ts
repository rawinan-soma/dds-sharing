// The business-hours clock (spec §15.2): Mon–Fri 08:30–16:30 ICT. It only
// advances inside those windows, so a 02:00 Sunday submit starts counting at
// 08:30 Monday. There is no public-holiday list, by decision (ADR 0021): a
// holiday counts as a working day, the one way this clock can be wrong.
//
// Everything is derived from the instants it is given: nothing is stored and
// nothing is scheduled (§15.1). ICT is a fixed UTC+7 with no daylight saving,
// so the working day is plain arithmetic on the epoch.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ICT_OFFSET_MS = 7 * HOUR_MS;
const OPENS_MS = 8.5 * HOUR_MS;
const CLOSES_MS = 16.5 * HOUR_MS;

/** The Request expiry promise, in business hours (§10.4). */
export const EXPIRY_BUSINESS_HOURS = 24;

// Days since 1970-01-01 in ICT, so day arithmetic never touches a timezone.
const ictDay = (instant: number) =>
  Math.floor((instant + ICT_OFFSET_MS) / DAY_MS);

const dayStart = (day: number) => day * DAY_MS - ICT_OFFSET_MS;

function isWorkingDay(day: number): boolean {
  // 1970-01-01 was a Thursday.
  const weekday = (day + 4) % 7;
  return weekday !== 0 && weekday !== 6;
}

/** Business hours elapsed from `from` to `to`; zero for an empty or backwards range. */
export function businessHoursBetween(from: Date, to: Date): number {
  const start = from.getTime();
  const end = to.getTime();
  if (end <= start) return 0;

  let total = 0;
  for (let day = ictDay(start); day <= ictDay(end); day++) {
    if (!isWorkingDay(day)) continue;
    const opens = dayStart(day) + OPENS_MS;
    const closes = dayStart(day) + CLOSES_MS;
    total += Math.max(0, Math.min(end, closes) - Math.max(start, opens));
  }
  return total / HOUR_MS;
}

/** The instant `hours` business hours after `from`. A day used up ends at its close. */
export function addBusinessHours(from: Date, hours: number): Date {
  let remaining = hours * HOUR_MS;
  const start = from.getTime();
  const firstDay = ictDay(start);

  // Terminates: a working day comes round within any seven.
  for (let day = firstDay; ; day++) {
    if (!isWorkingDay(day)) continue;
    const opens = dayStart(day) + OPENS_MS;
    const closes = dayStart(day) + CLOSES_MS;
    const begin = Math.max(start, opens);
    if (begin >= closes) continue;
    if (closes - begin >= remaining) return new Date(begin + remaining);
    remaining -= closes - begin;
  }
}

/**
 * `at` itself when the clock is running then, otherwise the next 08:30 on a
 * working day. This is the clock's second question (§15.2): not how much
 * attention time has elapsed, only whether anyone is there to be told.
 */
export function nextOpening(at: Date): Date {
  return addBusinessHours(at, 0);
}

export interface RequestExpiry {
  /** True at exactly 24 business hours: past this a Request is not actionable. */
  expired: boolean;
  /** Business hours before expiry, floored at zero. */
  hoursLeft: number;
  /** Business hours elapsed, as the `expired` event records it (§12.4). */
  hoursElapsed: number;
  expiresAt: Date;
}

/**
 * Expiry as a predicate over the clock (§15.1). Nothing writes this anywhere:
 * a dead scheduler cannot un-expire a Request, because the answer is derived
 * from `now` every time it is asked.
 */
export function requestExpiry(submittedAt: Date, now: Date): RequestExpiry {
  const hoursElapsed = businessHoursBetween(submittedAt, now);
  return {
    expired: hoursElapsed >= EXPIRY_BUSINESS_HOURS,
    hoursLeft: Math.max(0, EXPIRY_BUSINESS_HOURS - hoursElapsed),
    hoursElapsed,
    expiresAt: addBusinessHours(submittedAt, EXPIRY_BUSINESS_HOURS),
  };
}
