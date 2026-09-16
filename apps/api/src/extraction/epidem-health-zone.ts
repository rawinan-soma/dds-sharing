export interface ProvinceLookupRow {
  provinceId: string;
  healthRegion: number;
}

/** A read-once, held-for-the-job map from province code to health region (spec §6.4). */
export type ProvinceLookup = ReadonlyMap<string, number>;

export function buildProvinceLookup(
  rows: readonly ProvinceLookupRow[],
): ProvinceLookup {
  return new Map(rows.map((row) => [row.provinceId, row.healthRegion]));
}

export type HealthZoneResult =
  // epidem_chw_code is absent — a gap in the source (spec §6.3).
  | { value: null; kind: "absent" }
  // epidem_chw_code is present but not one of the 77 — the province table
  // is stale, not the source (spec §6.3): distinct from "absent" because it
  // means *our* reference data needs an operator's attention.
  | { value: null; kind: "unmapped" }
  | { value: number; kind: "ok" };

/**
 * The health region of `epidem_chw_code`, via the province lookup held for
 * the whole job (spec §6.3, §6.4). Upstream sends geography codes as JSON
 * numbers, so the caller must already have normalised to string (§4.6) —
 * this function only looks the string up.
 */
export function resolveHealthZone(
  epidemChwCode: unknown,
  provinces: ProvinceLookup,
): HealthZoneResult {
  if (epidemChwCode == null || epidemChwCode === "") {
    return { value: null, kind: "absent" };
  }

  const code = String(epidemChwCode);
  const region = provinces.get(code);
  if (region === undefined) {
    return { value: null, kind: "unmapped" };
  }

  return { value: region, kind: "ok" };
}
