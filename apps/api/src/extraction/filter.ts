// The Filter stage (spec §7.3, §4.4): a post-fetch row predicate on
// `epidem_chw_code`, never `chw_code` — that is the question a สคร. is
// asking, "cases I investigated", not "cases among my registered residents".

/**
 * Upstream sends geography codes as JSON numbers (`10`, not `"10"`). No
 * padding is needed: the province domain starts at 10, so no code can lose a
 * leading zero in transit (§4.6). An empty string is treated the same as
 * absent — upstream has never been observed to send one, but a field that is
 * present and blank is not a province code either.
 */
export function normalizeGeographyCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

export interface FilterOutcome {
  /** Whether the row belongs in this Request's Extract. */
  kept: boolean;
  /** `epidem_chw_code` was absent — mandatory in DDS reporting (§4.4). */
  epidemChwCodeMissing: boolean;
}

/**
 * `provinces` empty means national (§4.4): every row is kept regardless of
 * `epidem_chw_code`, so a national Request is unaffected by upstream's rare
 * missing-code rows — only the operational count below sees them. A
 * provincial or regional Request's stored province list is a prefix test,
 * not a join (§4.6): `chw_code` values are exactly two digits, so this is
 * equality in practice, expressed as a prefix test to match the spec's own
 * wording and to stay correct if that ever changes.
 */
export function filterRow(
  row: Record<string, unknown>,
  provinces: readonly string[],
): FilterOutcome {
  const code = normalizeGeographyCode(row.epidem_chw_code);
  if (code === null) {
    return { kept: provinces.length === 0, epidemChwCodeMissing: true };
  }
  if (provinces.length === 0) {
    return { kept: true, epidemChwCodeMissing: false };
  }
  return {
    kept: provinces.some((province) => code.startsWith(province)),
    epidemChwCodeMissing: false,
  };
}
