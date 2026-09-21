import * as m from '../../paraglide/messages.js';

/** Business minutes as "N h NN m" (or "N m" under the hour), from the catalogue. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0
    ? m.reviewer_duration_hm({
        hours,
        minutes: String(rest).padStart(2, '0'),
      })
    : m.reviewer_duration_m({ minutes: rest });
}

/**
 * How many Requests arrived or left between two reads of the queue: what the
 * staleness line reports, so a Reviewer can tell whether a reload was worth it.
 */
export function countChanges(
  before: readonly { id: string }[],
  after: readonly { id: string }[],
): number {
  const was = new Set(before.map((r) => r.id));
  const is = new Set(after.map((r) => r.id));
  let changes = 0;
  for (const id of is) if (!was.has(id)) changes++;
  for (const id of was) if (!is.has(id)) changes++;
  return changes;
}

export function minutesSince(then: number, now: number): number {
  return Math.max(0, Math.floor((now - then) / 60_000));
}

// The submit time as ICT, in the Buddhist era the Requester's own date fields
// use. The screen pairs it with `<time datetime>` so nothing has to parse it back.
const INSTANT = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Bangkok',
});

export const formatInstant = (iso: string): string =>
  INSTANT.format(new Date(iso));
