// The decision behind both routes (spec §9.1, §9.2, ADR 0018), kept pure and
// independent of the database/MinIO so it is directly testable: given a
// resolved token row (or none) and, for the archive route, how many prior
// successful presentations it has and whether the object still exists, what
// outcome does this presentation get.

export const ATTEMPT_CAP = 10;

export interface DownloadTokenRow {
  id: string;
  requestId: string;
  archiveFilename: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type LookupOutcome =
  | 'success'
  | 'unknown_token'
  | 'expired'
  | 'revoked'
  | 'attempts_exhausted'
  | 'object_missing';

/** `GET /d/<token>` (ADR 0018): a lookup, never an Attempt, never capped. */
export function resolvePageLookup(
  row: DownloadTokenRow | null,
  now: Date,
): LookupOutcome {
  if (!row) return 'unknown_token';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt <= now) return 'expired';
  return 'success';
}

/**
 * `GET /d/<token>/archive`: the Attempt route. `priorSuccessfulAttempts`
 * counts only presentations of *this* live token that already succeeded —
 * refused presentations (of a dead or already-exhausted token) never count
 * towards the cap, so the 11th+ request against an exhausted token stays
 * `attempts_exhausted` forever rather than drifting the count past 10.
 */
export function resolveArchiveAttempt(
  row: DownloadTokenRow | null,
  now: Date,
  priorSuccessfulAttempts: number,
  objectExists: boolean,
): LookupOutcome {
  if (!row) return 'unknown_token';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt <= now) return 'expired';
  if (priorSuccessfulAttempts >= ATTEMPT_CAP) return 'attempts_exhausted';
  if (!objectExists) return 'object_missing';
  return 'success';
}
