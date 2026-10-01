// The Area selection, read back from the provinces a Request stores. Shared by
// the Reviewer's screens and the delivery email, so neither imports the other.

export interface ProvinceName {
  provinceId: string;
  nameTh: string;
  healthRegion: number;
}

export type Area =
  | { kind: 'national' }
  | {
      kind: 'provinces';
      provinces: { id: string; name: string }[];
      /** Set only when the provinces are exactly one health region's whole set. */
      region: number | null;
    };

/**
 * A Request's Area selection as people name it. A Request stores provinces and
 * never a region (§4.4), so a region is recognised here rather than remembered.
 */
export function describeArea(
  stored: readonly string[],
  lookup: readonly ProvinceName[],
): Area {
  if (stored.length === 0) return { kind: 'national' };

  const names = new Map(lookup.map((p) => [p.provinceId, p]));
  const provinces = stored
    .toSorted()
    .map((id) => ({ id, name: names.get(id)?.nameTh ?? id }));

  const regions = new Set(stored.map((id) => names.get(id)?.healthRegion));
  const [only] = regions;
  const whole =
    regions.size === 1 &&
    only !== undefined &&
    stored.length > 1 &&
    lookup.filter((p) => p.healthRegion === only).length === stored.length;

  return { kind: 'provinces', provinces, region: whole ? only : null };
}
