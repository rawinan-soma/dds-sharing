import * as m from '../../paraglide/messages.js';
import { type InFlightRow } from './queue-api';
import { formatDuration, minutesSince } from './queue-format';

/**
 * How an in-flight row reads (§10.9): "extracting" is the honest answer to why
 * nothing can be pressed, and a ready link shows its wall-clock time left —
 * a timestamp the system will act on, not a prediction. `now` is the caller's
 * clock reading, so a ticking page stays consistent.
 */
export function inFlightState(entry: InFlightRow, now: number): string {
  switch (entry.extraction) {
    case 'extracting':
      return m.reviewer_state_extracting();
    case 'failed':
      return m.reviewer_state_failed();
    case 'ready':
      return entry.linkExpiresAt
        ? m.reviewer_inflight_link_left({
            time: linkLeft(entry.linkExpiresAt, now),
          })
        : m.reviewer_state_ready();
  }
}

/** Wall-clock time left on a link, as "N h NN m". */
export function linkLeft(expiresAt: string, now: number): string {
  return formatDuration(minutesSince(now, new Date(expiresAt).getTime()));
}
