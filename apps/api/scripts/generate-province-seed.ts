import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProvincesCsv } from '../src/reference/province-rows';
import {
  PROVINCE_SEED_MIGRATION,
  PROVINCE_SEED_MODULE,
  provinceSeedMigrationSql,
  provinceSeedModuleSource,
} from '../src/reference/province-seed';

const apiRoot = join(__dirname, '..');
const csv = readFileSync(join(apiRoot, '../../docs/provinces.csv'), 'utf-8');
const rows = parseProvincesCsv(csv);

writeFileSync(
  join(apiRoot, PROVINCE_SEED_MIGRATION),
  provinceSeedMigrationSql(rows),
);
writeFileSync(
  join(apiRoot, PROVINCE_SEED_MODULE),
  provinceSeedModuleSource(rows),
);
console.log(`Generated the province seed from ${rows.length} rows.`);
