export interface EpidemChwCodeCheck {
  included: boolean;
  /**
   * True whenever `epidem_chw_code` is missing — independent of `included`.
   * A national Request (empty `provinceCodes`) never excludes a row on
   * this ground, but the absence is still a data-quality fact worth
   * counting for the operational alert (spec §6.1, §7.3) regardless of
   * whether anything was actually filtered.
   */
  absent: boolean;
}

/**
 * Normalises `epidem_chw_code` to string before comparing — upstream sends
 * geography codes as JSON numbers (§4.6) — and reports whether the row
 * belongs to the Request's stored province list.
 *
 * `provinceCodes` is a **prefix set**: national ⇒ empty (nothing filtered),
 * a province ⇒ one code, a region ⇒ the province list it expanded to at
 * submit (§4.4). `chw_code`/`epidem_chw_code` sit at the same level as a
 * province code (§4.6), so the "prefix comparison" the spec names is exact
 * equality once both sides are two-digit strings — it stays a `startsWith`
 * so this function keeps working unchanged if a finer-grained area
 * selection is ever added.
 */
export function matchesAreaFilter(
  epidemChwCode: unknown,
  provinceCodes: readonly string[],
): EpidemChwCodeCheck {
  const absent = epidemChwCode == null || epidemChwCode === "";

  if (provinceCodes.length === 0) {
    return { included: true, absent };
  }
  if (absent) {
    return { included: false, absent: true };
  }

  const normalized = String(epidemChwCode);
  return {
    included: provinceCodes.some((code) => normalized.startsWith(code)),
    absent: false,
  };
}
