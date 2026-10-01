import * as m from '../../paraglide/messages.js';
import { type ExtractionState, type InFlightRow } from './queue-api';
import { formatDuration, minutesSince } from './queue-format';

/**
 * The in-flight row's link cell (§10.9): a ready link shows its wall-clock
 * time left, a timestamp the system will act on, not a prediction; while
 * extracting, the row says why nothing can be pressed. `now` is the caller's
 * clock reading, so a ticking page stays consistent.
 */
export function inFlightLinkCell(entry: InFlightRow, now: number): string {
  switch (entry.extraction) {
    case 'ready':
      return entry.linkExpiresAt
        ? m.reviewer_inflight_link_left({
            time: linkLeft(entry.linkExpiresAt, now),
          })
        : '';
    case 'extracting':
      return m.reviewer_inflight_extracting_note();
    case 'failed':
      return '';
  }
}

/** The Tag tone for an extraction state: ready to act on, nothing to do, broken. */
export function extractionTone(
  state: ExtractionState,
): 'success' | 'inert' | 'failed' {
  switch (state) {
    case 'ready':
      return 'success';
    case 'extracting':
      return 'inert';
    case 'failed':
      return 'failed';
  }
}

/** The extraction state as one word, from the catalogue. */
export function extractionWord(state: ExtractionState): string {
  switch (state) {
    case 'extracting':
      return m.reviewer_state_extracting();
    case 'failed':
      return m.reviewer_state_failed();
    case 'ready':
      return m.reviewer_state_ready();
  }
}

/** Wall-clock time left on a link, as "N h NN m". */
export function linkLeft(expiresAt: string, now: number): string {
  return formatDuration(minutesSince(now, new Date(expiresAt).getTime()));
}
