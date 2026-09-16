const MAX_PLAUSIBLE_AGE_YEARS = 120;

export type OnsetAgeResult =
  // birth_date (or onset_date) is missing — a gap in the source, not
  // counted as impossible (spec §6.3).
  | { value: null; impossible: false }
  // Computed cleanly.
  | { value: number; impossible: false }
  // Malformed input, a future birth_date, onset before birth, or an age
  // over 120 — counted per job (spec §6.3).
  | { value: null; impossible: true };

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The case's age in completed years at `onset_date` (spec §6.3, ADR 0002) —
 * anchored on the case, never on the Request's submission date, so two
 * Extracts report the same case identically. Never falls back to upstream's
 * `age_y`: rule 6 (§6.1) forbids a derived column from reading a field that
 * is not itself on the allowlist, and `age_y` is dropped (§6.5).
 *
 * Absent, malformed and impossible inputs all emit `null` (an empty cell) —
 * never a sentinel, never a dropped row, never a clamp to 0. Only the
 * malformed/impossible cases are counted; an absent field is normal
 * (§6.1 rule 1) and must never alert.
 */
export function computeOnsetAge(
  birthDateRaw: unknown,
  onsetDateRaw: unknown,
  now: Date = new Date(),
): OnsetAgeResult {
  if (birthDateRaw == null || birthDateRaw === "") {
    return { value: null, impossible: false };
  }
  if (onsetDateRaw == null || onsetDateRaw === "") {
    return { value: null, impossible: false };
  }

  const birthDate = parseDate(birthDateRaw);
  const onsetDate = parseDate(onsetDateRaw);
  if (!birthDate || !onsetDate) {
    return { value: null, impossible: true };
  }
  if (birthDate.getTime() > now.getTime()) {
    return { value: null, impossible: true };
  }
  if (onsetDate.getTime() < birthDate.getTime()) {
    return { value: null, impossible: true };
  }

  let age = onsetDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthdayByOnset =
    onsetDate.getUTCMonth() > birthDate.getUTCMonth() ||
    (onsetDate.getUTCMonth() === birthDate.getUTCMonth() &&
      onsetDate.getUTCDate() >= birthDate.getUTCDate());
  if (!hadBirthdayByOnset) age -= 1;

  if (age > MAX_PLAUSIBLE_AGE_YEARS) {
    return { value: null, impossible: true };
  }

  return { value: age, impossible: false };
}
