/**
 * The Extract's 23 columns, fixed and in this order (spec §6.2, §7.4). A
 * missing upstream key becomes an empty cell; there is no other way a
 * column reaches the Extract. Each derived column sits immediately after
 * the input it was computed from — `epidem_health_zone` after
 * `epidem_chw_code`, `onset_age` after `onset_date`.
 */
export const EXTRACT_COLUMNS = [
  "epidem_report_guid",
  "epidem_report_group_code",
  "diagnosis_icd10",
  "diagnosis_icd10_list",
  "birth_date",
  "gender",
  "prefix",
  "nationality",
  "occupation",
  "marital_status_id",
  "chw_code",
  "amp_code",
  "epidem_chw_code",
  "epidem_health_zone",
  "epidem_amp_code",
  "hospital_code",
  "onset_date",
  "onset_age",
  "treated_date",
  "diagnosis_date",
  "death_date",
  "report_datetime",
  "update_datetime",
] as const;

export type ExtractColumn = (typeof EXTRACT_COLUMNS)[number];

/** The two columns Project computes rather than copies (spec §6.3). */
export const DERIVED_COLUMNS = ["epidem_health_zone", "onset_age"] as const;

/**
 * Every upstream field name this codebase has ever catalogued — the 21 kept
 * (§6.2) plus every field named as dropped (§6.5) and as a twin (§6.1 rule
 * 4). **Not** upstream's full per-group key set, which is unenumerable and
 * varies by group and date range (§6.6) — this is the closed catalogue of
 * names the design has actually reasoned about.
 *
 * A key on an upstream row that is in neither this set nor `EXTRACT_COLUMNS`
 * is genuinely new — the case §6.1 rule 1's "unknown field name" alert
 * exists to catch, e.g. an upstream schema change adding a field nobody
 * has reviewed for rule 6 (a derived column may read only fields that are
 * themselves kept).
 */
export const KNOWN_DROPPED_UPSTREAM_FIELDS = [
  // Direct identifiers (§6.5).
  "cid",
  "first_name",
  "last_name",
  "mobile_phone",
  "passport_no",
  // Sub-district geography and point location, plus their epidem_ twins
  // (§6.1 rule 4, §6.5).
  "moo",
  "epidem_moo",
  "road",
  "epidem_road",
  "address",
  "epidem_address",
  "tmb_code",
  "epidem_tmb_code",
  "location_gis_latitude",
  "location_gis_longitude",
  "cluster_latitude",
  "cluster_longitude",
  // Free text (§6.5).
  "cdeath",
  "active_case_finding",
  "lab_his_ref_name",
  "lab_report_result",
  // Upstream internal keys (§6.5).
  "id",
  "lab_his_ref_code",
  // All clinical fields (§6.5).
  "complication",
  "organism",
  "epidem_person_status_id",
  "epidem_symptom_type_id",
  "patient_type",
  "vaccinated_status",
  "respirator_status",
  "tmlt_code",
  "status",
  "lab_report_date",
  // Superseded by derivation (§6.5).
  "age_y",
  "age_m",
  "age_d",
  "health_zone",
  // Redundant (§6.5).
  "treated_hospital_code",
  "hospital_name",
  "isolate_chw_code",
  "municipal",
  "generation_datetime",
] as const;

const KNOWN_UPSTREAM_FIELD_SET = new Set<string>([
  ...EXTRACT_COLUMNS.filter(
    (column) => !(DERIVED_COLUMNS as readonly string[]).includes(column),
  ),
  ...KNOWN_DROPPED_UPSTREAM_FIELDS,
]);

/** True for any field name this design has reviewed — kept or deliberately dropped. */
export function isKnownUpstreamField(fieldName: string): boolean {
  return KNOWN_UPSTREAM_FIELD_SET.has(fieldName);
}
