import { type Snapshot } from '../audit/event-catalogue';
import { type ProbeRowCount } from '../requests/probe-row-count';

// The Decision's pure rules (spec §10.3): what counts as a valid reject note,
// and what the Reviewer had on screen at the moment they decided. Nothing here
// touches the database or the clock.

/** A mandatory internal note, at least 10 characters once trimmed (§10.3). */
export const MIN_NOTE_LENGTH = 10;

export function noteIsValid(note: string): boolean {
  return note.trim().length >= MIN_NOTE_LENGTH;
}

export interface SnapshotSource {
  diseaseGroupName: string;
  reportCodes: readonly string[];
  startDate: string;
  endDate: string;
  provinces: readonly string[];
  workplace: string;
}

/**
 * The Snapshot copies the ask and the Workplace, never the other contact
 * fields (§12.3), and the row count exactly as the Reviewer had it on screen:
 * a number, or still `pending` or `failed`, since a Decision waits on neither
 * (§5.4).
 */
export function buildSnapshot(
  row: SnapshotSource,
  probeRowCount: ProbeRowCount,
): Snapshot {
  return {
    diseaseGroupName: row.diseaseGroupName,
    reportCodes: [...row.reportCodes],
    startDate: row.startDate,
    endDate: row.endDate,
    provinces: [...row.provinces],
    probeRowCount,
    workplace: row.workplace,
  };
}
