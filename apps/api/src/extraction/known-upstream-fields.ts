// The complete catalogue of upstream field names this design has ever
// accounted for (spec §6.2, §6.5, §4.6) — kept, or deliberately dropped and
// recorded why. A field outside this set is not "off the allowlist" (most
// upstream fields are, on purpose): it is one nobody has ever looked at, and
// that is what rule 1's operational alert exists to catch (§6.1, §7.4).
//
// §6.6 measured 63 keys in the union across all 25 Report codes; this list is
// every name the spec documents by name, which is not the same claim — an
// upstream field that has never been individually named here (kept, dropped,
// or otherwise) triggers the alert rather than being assumed benign, which is
// the whole point of the check.

/** The 21 upstream-sourced columns of the Extract (§6.2) — the two derived
 * columns, `onset_age` and `epidem_health_zone`, read no upstream key of
 * their own name. */
export const UPSTREAM_ALLOWLIST_FIELDS = [
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
  'epidem_amp_code',
  'hospital_code',
  'onset_date',
  'treated_date',
  'diagnosis_date',
  'death_date',
  'report_datetime',
  'update_datetime',
] as const;

/** Known, and dropped on purpose (§6.5) — never an "unknown field" alert. */
export const KNOWN_DROPPED_FIELDS = [
  // Direct identifiers: arrive already encrypted upstream (cid, first_name,
  // last_name, mobile_phone) or plaintext (passport_no).
  'cid',
  'first_name',
  'last_name',
  'mobile_phone',
  'passport_no',
  // Sub-district geography and point location, and their epidem_ twins.
  'moo',
  'road',
  'address',
  'tmb_code',
  'epidem_moo',
  'epidem_road',
  'epidem_address',
  'epidem_tmb_code',
  'location_gis_latitude',
  'location_gis_longitude',
  'cluster_latitude',
  'cluster_longitude',
  // Free text (rule 2).
  'cdeath',
  'active_case_finding',
  'lab_his_ref_name',
  'lab_report_result',
  // Upstream internal keys.
  'id',
  'lab_his_ref_code',
  // All clinical fields.
  'complication',
  'organism',
  'epidem_person_status_id',
  'epidem_symptom_type_id',
  'patient_type',
  'vaccinated_status',
  'respirator_status',
  'tmlt_code',
  'status',
  'lab_report_date',
  // Superseded by derivation (§6.3): `age_y` in particular is never read as a
  // fallback for `onset_age`, however tempting — that is rule 6.
  'age_y',
  'age_m',
  'age_d',
  'health_zone',
  // Redundant with a kept column, measured (§6.5).
  'treated_hospital_code',
  'hospital_name',
  'isolate_chw_code',
  'municipal',
  'generation_datetime',
  // Upstream's own grouping (§4.6) — never read back as the Report code.
  'epidem_report_group_id',
] as const;

export const KNOWN_UPSTREAM_FIELDS: ReadonlySet<string> = new Set([
  ...UPSTREAM_ALLOWLIST_FIELDS,
  ...KNOWN_DROPPED_FIELDS,
]);
