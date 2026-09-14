import { THAI_PUBLIC_HOLIDAYS } from "./thai-public-holidays.js";

// The business-hours clock (spec §10.2, §10.5; ported from
// docs/design_handoff_dds_sharing/DDS Sharing.dc.html's `businessHoursBetween`
// / `addBusinessHours`, its arithmetic worth lifting "more or less as
// written"). Mon–Fri 08:30–16:30 ICT (UTC+7, no DST), minus the checked-in
// Thai public holiday list — a 02:00 Sunday submit starts counting at 08:30
// Monday, and a holiday inside the window contributes nothing.
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const BUSINESS_OPEN_MIN = 8 * 60 + 30;
const BUSINESS_CLOSE_MIN = 16 * 60 + 30;

const HOLIDAYS = new Set(THAI_PUBLIC_HOLIDAYS);

function toIct(ms: number): number {
  return ms + ICT_OFFSET_MS;
}

/** The UTC instant (in ms) of 00:00 ICT on the ICT calendar day containing `ms`. */
function ictDayStart(ms: number): number {
  return Math.floor(toIct(ms) / DAY_MS) * DAY_MS - ICT_OFFSET_MS;
}

function ictIsoDate(ms: number): string {
  return new Date(toIct(ms)).toISOString().slice(0, 10);
}

function isBusinessDay(ms: number): boolean {
  const weekday = new Date(toIct(ms)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !HOLIDAYS.has(ictIsoDate(ms));
}

/**
 * Business-hours minutes elapsed inside `[from, to)`, walking one ICT
 * calendar day at a time and clamping each to its 08:30–16:30 window.
 * Non-positive (or reversed) ranges are 0, never negative.
 */
export function businessHoursBetween(from: Date, to: Date): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) return 0;

  let minutes = 0;
  for (let day = ictDayStart(fromMs); day <= toMs; day += DAY_MS) {
    if (!isBusinessDay(day)) continue;
    const open = day + BUSINESS_OPEN_MIN * MIN_MS;
    const close = day + BUSINESS_CLOSE_MIN * MIN_MS;
    const start = Math.max(open, fromMs);
    const end = Math.min(close, toMs);
    if (end > start) minutes += (end - start) / MIN_MS;
  }
  return minutes / 60;
}

/** 08:30 ICT on the next business day strictly after the one containing `t`. */
function nextBusinessOpen(t: number): number {
  return ictDayStart(t) + DAY_MS + BUSINESS_OPEN_MIN * MIN_MS;
}

/** The instant `hours` business hours after `from` — used for the 24-hour decision deadline. */
export function addBusinessHours(from: Date, hours: number): Date {
  let t = from.getTime();
  let remainingMinutes = hours * 60;

  while (remainingMinutes > 0) {
    if (!isBusinessDay(t)) {
      t = nextBusinessOpen(t);
      continue;
    }
    const open = ictDayStart(t) + BUSINESS_OPEN_MIN * MIN_MS;
    const close = ictDayStart(t) + BUSINESS_CLOSE_MIN * MIN_MS;
    if (t < open) t = open;
    if (t >= close) {
      t = nextBusinessOpen(t);
      continue;
    }
    const availableMinutes = (close - t) / MIN_MS;
    if (availableMinutes >= remainingMinutes) return new Date(t + remainingMinutes * MIN_MS);
    remainingMinutes -= availableMinutes;
    t = nextBusinessOpen(t);
  }
  return new Date(t);
}

/** "3 h 15 m left" / "expired" — never negative (spec §10.2's countdown, never an alarm). */
export function formatBusinessHoursRemaining(hours: number): string {
  if (hours <= 0) return "expired";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return `${wholeHours} h ${String(minutes).padStart(2, "0")} m left`;
}

export interface DecisionWindow {
  businessHoursRemaining: number;
  timeRemainingLabel: string;
  isActionable: boolean;
}

/**
 * The three fields that always travel together wherever a Request's
 * decision deadline is shown (the queue row and the dossier alike) — one
 * computation instead of the same subtraction repeated at each call site.
 */
export function decisionWindowView(submittedAt: Date, now: Date, windowHours: number): DecisionWindow {
  const remaining = windowHours - businessHoursBetween(submittedAt, now);
  return {
    businessHoursRemaining: Math.max(remaining, 0),
    timeRemainingLabel: formatBusinessHoursRemaining(remaining),
    isActionable: remaining > 0,
  };
}
