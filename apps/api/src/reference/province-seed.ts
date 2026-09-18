import { checksumProvinces, type ProvinceRow } from './province-rows';

// Relative to apps/api. The migration and the generated module below are both
// derived from docs/provinces.csv, which stays canonical; never hand-edit them.
export const PROVINCE_SEED_MIGRATION =
  'src/db/migrations/0002_seed_province.sql';
export const PROVINCE_SEED_MODULE = 'src/reference/province-seed.generated.ts';

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function provinceSeedMigrationSql(rows: readonly ProvinceRow[]): string {
  const values = rows
    .map(
      (r) =>
        `\t(${quote(r.provinceId)}, ${quote(r.nameTh)}, ${r.healthRegion})`,
    )
    .join(',\n');

  return `-- Generated from docs/provinces.csv by \`pnpm db:generate-province-seed\`.
-- docs/provinces.csv stays canonical: change it there and regenerate, never
-- edit this file. The server refuses to boot if the table disagrees (spec §6.4).
INSERT INTO "province" ("province_id", "name_th", "health_region") VALUES
${values};
`;
}

export function provinceSeedModuleSource(rows: readonly ProvinceRow[]): string {
  return `// Generated from docs/provinces.csv by \`pnpm db:generate-province-seed\`. Do not edit.
// What the boot check asserts about the province table (spec §6.4).
export const PROVINCE_SEED_ROW_COUNT = ${rows.length};
export const PROVINCE_SEED_CHECKSUM =
  '${checksumProvinces(rows)}';
`;
}
