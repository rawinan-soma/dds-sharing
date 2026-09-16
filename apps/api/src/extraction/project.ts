import { EXTRACT_COLUMNS, isKnownUpstreamField } from "./allowlist.js";
import { computeOnsetAge } from "./onset-age.js";
import {
  resolveHealthZone,
  type ProvinceLookup,
} from "./epidem-health-zone.js";

/** One projected row — the fixed 23 columns, in order, `null` for an empty cell. */
export type ProjectedRow = Record<(typeof EXTRACT_COLUMNS)[number], unknown>;

export interface ProjectionCounters {
  /** Malformed/impossible `onset_age` inputs — never an absent one (spec §6.3). */
  impossibleDerivationInputs: number;
  /** `epidem_chw_code` present but not one of the 77 — the province table is stale (spec §6.3). */
  unmappedHealthZoneCount: number;
  /** Field names observed on a row that this codebase has never catalogued (spec §6.1 rule 1). */
  unknownFieldNames: Set<string>;
}

export function newProjectionCounters(): ProjectionCounters {
  return {
    impossibleDerivationInputs: 0,
    unmappedHealthZoneCount: 0,
    unknownFieldNames: new Set(),
  };
}

/**
 * Project (spec §7.4): emits exactly the fixed 23 columns, in that order,
 * from the allowlist and never from the observed response keys. Mutates
 * `counters` in place — the job accumulates one set of these across every
 * row of every Report code, then reports the totals once (§6.3, §12.4).
 *
 * The writer is never given column semantics (§7.4) — this is the one place
 * that reads what a column *means*; everything downstream of this function
 * sees only the fixed 23 keys.
 */
export function projectRow(
  row: Record<string, unknown>,
  reportCode: string,
  provinces: ProvinceLookup,
  counters: ProjectionCounters,
  now: Date = new Date(),
): ProjectedRow {
  for (const key of Object.keys(row)) {
    if (!isKnownUpstreamField(key)) {
      counters.unknownFieldNames.add(key);
    }
  }

  const onsetAge = computeOnsetAge(row["birth_date"], row["onset_date"], now);
  if (onsetAge.impossible) counters.impossibleDerivationInputs += 1;

  const healthZone = resolveHealthZone(row["epidem_chw_code"], provinces);
  if (healthZone.kind === "unmapped") counters.unmappedHealthZoneCount += 1;

  const projected = {} as ProjectedRow;
  for (const column of EXTRACT_COLUMNS) {
    switch (column) {
      case "onset_age":
        projected[column] = onsetAge.value;
        break;
      case "epidem_health_zone":
        projected[column] = healthZone.value;
        break;
      // Column 2 is the Report code the row was fetched under, not read
      // back from any response field (§4.6, §6.2) — the job already knows
      // it because it made one call per code.
      case "epidem_report_group_code":
        projected[column] = reportCode;
        break;
      default:
        projected[column] = row[column] ?? null;
    }
  }

  return projected;
}
