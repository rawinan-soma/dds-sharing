import { createHash } from 'node:crypto';

export interface ProvinceRow {
  provinceId: string;
  nameTh: string;
  healthRegion: number;
}

export function parseProvincesCsv(csv: string): ProvinceRow[] {
  const [header, ...lines] = csv
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  if (header !== 'province_id,name_th,health_region') {
    throw new Error(`Unexpected provinces.csv header: ${header}`);
  }

  return lines.map((line) => {
    const [provinceId, nameTh, healthRegion, ...extra] = line.split(',');
    if (extra.length > 0 || !/^\d{2}$/.test(provinceId)) {
      throw new Error(`Malformed provinces.csv row: ${line}`);
    }
    return { provinceId, nameTh, healthRegion: Number(healthRegion) };
  });
}

// One canonical serialisation, used on both sides of the boot check: the
// checksum pinned at generation time and the one taken over the live table.
export function checksumProvinces(rows: readonly ProvinceRow[]): string {
  const canonical = rows
    .toSorted((a, b) => a.provinceId.localeCompare(b.provinceId))
    .map((r) => `${r.provinceId},${r.nameTh},${r.healthRegion}\n`)
    .join('');
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}
