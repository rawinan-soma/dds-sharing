import { createHash } from "node:crypto";

export interface ProvinceRow {
  provinceId: string;
  nameTh: string;
  healthRegion: number;
}

/**
 * A canonical SHA-256 over the province table's contents (spec §6.4, ADR
 * 0002). Order-independent — rows are sorted by `provinceId` before hashing
 * — so a checksum comparison never fails on read order alone. Used both to
 * bake the expected checksum into {@link ../reference-data/province-seed.generated.js}
 * at generation time and to verify the live table against it at boot.
 */
export function computeProvinceChecksum(rows: readonly ProvinceRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.provinceId.localeCompare(b.provinceId))
    .map((row) => `${row.provinceId}|${row.nameTh}|${row.healthRegion}`)
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface ProvinceSeedMeta {
  readonly rowCount: number;
  readonly checksum: string;
}

/**
 * Fails fast on a seed that has drifted from `docs/provinces.csv` — never a
 * warning, never a degraded mode (spec §6.4). A half-applied seed would
 * blank `epidem_health_zone` for every row of a job, so this must stop boot,
 * not merely log.
 */
export function assertProvinceSeedIntegrity(
  rows: readonly ProvinceRow[],
  expected: ProvinceSeedMeta,
): void {
  if (rows.length !== expected.rowCount) {
    throw new Error(
      `Province seed integrity check failed: expected ${expected.rowCount} rows, found ${rows.length}. ` +
        `Treat this as a boot failure, not a warning — a half-applied seed blanks epidem_health_zone ` +
        `for every row of a job (spec §6.4).`,
    );
  }

  const checksum = computeProvinceChecksum(rows);
  if (checksum !== expected.checksum) {
    throw new Error(
      `Province seed integrity check failed: checksum mismatch (expected ${expected.checksum}, got ${checksum}). ` +
        `docs/provinces.csv is canonical — the database has drifted from the repo (spec §6.4, ADR 0002).`,
    );
  }
}
