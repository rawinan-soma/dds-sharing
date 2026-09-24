// The Project stage (spec §7.4, §6.2, §6.3): the fixed 23-column allowlist,
// the fixed column order, and both derivations. The writer that will turn
// this into CSV bytes is a later ticket (#70) — this stage's job ends at a
// plain object per row, in memory, never on disk (§7.1).

import { normalizeGeographyCode } from './filter';
import { KNOWN_UPSTREAM_FIELDS } from './known-upstream-fields';

/**
 * The allowlist, in order (spec §6.2). Each derived column sits immediately
 * after the input it reads, so a reader scanning the header sees each
 * computed column beside what produced it.
 */
export const PROJECT_COLUMNS = [
  'epidem_report_guid',
  'epidem_report_group_code',
  'diagnosis_icd10',
  'diagnosis_icd10_list',
  'birth_date',
  'gender',
  'prefix',
  'nationality',
  'occupation',
  'marital_status_id',
  'chw_code',
  'amp_code',
  'epidem_chw_code',
  'epidem_health_zone',
  'epidem_amp_code',
  'hospital_code',
  'onset_date',
  'onset_age',
  'treated_date',
  'diagnosis_date',
  'death_date',
  'report_datetime',
  'update_datetime',
] as const;

export type ProjectColumn = (typeof PROJECT_COLUMNS)[number];

export type ProjectedRow = Readonly<Record<ProjectColumn, string>>;

/** Upstream fields read verbatim (rule 2: coded and delimited-code only). */
const PASSTHROUGH_COLUMNS = PROJECT_COLUMNS.filter(
  (
    c,
  ): c is Exclude<
    ProjectColumn,
    'epidem_report_group_code' | 'epidem_health_zone' | 'onset_age'
  > =>
    c !== 'epidem_report_group_code' &&
    c !== 'epidem_health_zone' &&
    c !== 'onset_age',
);

/**
 * A `epidem_chw_code` present but not one of the 77 known provinces means the
 * province table is stale, not that the row is malformed (spec §6.3). This is
 * the one case that is not a blank: it fails the job loudly and raises the
 * scheduler signal (§15.3) rather than publish an Extract with a column a
 * regional analyst is about to group by silently wrong. The message never
 * quotes the code — it is a field of a row (§14.5); the pipeline adds the
 * row index.
 */
export class StaleProvinceTableError extends Error {
  constructor() {
    super('epidem_chw_code is not one of the 77 known provinces');
    this.name = 'StaleProvinceTableError';
  }
}

/** Mutated in place by `projectRow`, one instance per job (spec: "the count
 * goes on the record"; §6.1, §6.3, §7.4). Never holds a row or a field value. */
export interface ProjectCounters {
  /** `onset_date` before `birth_date`, a future `birth_date`, age over 120. */
  impossibleDerivationInputs: number;
  /** A field name never catalogued as kept or dropped (rule 1). */
  unknownFieldNames: Set<string>;
}

export function newProjectCounters(): ProjectCounters {
  return { impossibleDerivationInputs: 0, unknownFieldNames: new Set() };
}

function cell(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
      return String(value);
    default:
      return '';
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

function parseDayPrefix(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const date = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MAX_PLAUSIBLE_AGE = 120;

/**
 * Completed years at `onset_date`, anchored on the case rather than on
 * submission so two Extracts are comparable and appendable (spec §6.3, ADR
 * 0002). Absent or malformed inputs are a blank with no count; impossible
 * ones — onset before birth, a future birth date, or an age over 120 — are a
 * blank *and* counted. `age_y` is never read, even though upstream ships it:
 * rule 6 forbids a derived column from falling back to a field outside the
 * allowlist.
 */
function deriveOnsetAge(
  row: Record<string, unknown>,
  now: Date,
  counters: ProjectCounters,
): string {
  const birth = parseDayPrefix(row.birth_date);
  const onset = parseDayPrefix(row.onset_date);
  if (birth === null || onset === null) return '';

  if (onset.getTime() < birth.getTime() || birth.getTime() > now.getTime()) {
    counters.impossibleDerivationInputs += 1;
    return '';
  }

  let years = onset.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthdayThisYear =
    onset.getUTCMonth() < birth.getUTCMonth() ||
    (onset.getUTCMonth() === birth.getUTCMonth() &&
      onset.getUTCDate() < birth.getUTCDate());
  if (beforeBirthdayThisYear) years -= 1;

  if (years < 0 || years > MAX_PLAUSIBLE_AGE) {
    counters.impossibleDerivationInputs += 1;
    return '';
  }
  return String(years);
}

/**
 * The health region of `epidem_chw_code` (spec §6.3). A null code is a gap in
 * the source and is blank, uncounted — the missing-code count belongs to the
 * Filter stage (§7.3), which sees every fetched row, not just the ones that
 * reach Project. A code that is not null but is not in `provinces` throws
 * {@link StaleProvinceTableError}.
 */
function deriveHealthZone(
  row: Record<string, unknown>,
  provinces: ReadonlyMap<string, number>,
): string {
  const code = normalizeGeographyCode(row.epidem_chw_code);
  if (code === null) return '';
  const region = provinces.get(code);
  if (region === undefined) throw new StaleProvinceTableError();
  return String(region);
}

/**
 * Projects one already-filtered row. `groupCode` is the Report code the row
 * was fetched under — never read back out of the response (spec §4.6) — and
 * is what fills column 2 regardless of what `epidem_report_group_code` holds
 * in the response body.
 */
export function projectRow(
  row: Record<string, unknown>,
  groupCode: string,
  provinces: ReadonlyMap<string, number>,
  now: Date,
  counters: ProjectCounters,
): ProjectedRow {
  for (const key of Object.keys(row)) {
    if (!KNOWN_UPSTREAM_FIELDS.has(key)) counters.unknownFieldNames.add(key);
  }

  const values: Record<string, string> = {};
  for (const column of PASSTHROUGH_COLUMNS) values[column] = cell(row, column);
  values.epidem_report_group_code = groupCode;
  values.epidem_health_zone = deriveHealthZone(row, provinces);
  values.onset_age = deriveOnsetAge(row, now, counters);

  return values as ProjectedRow;
}
