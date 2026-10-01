import { readFileSync } from 'node:fs';
import { apiPath, repoPath } from '../repo-paths';
import { describe, expect, it } from 'vitest';
import {
  PROVINCE_SEED_MIGRATION,
  provinceSeedMigrationSql,
  provinceSeedModuleSource,
} from './province-seed';
import {
  PROVINCE_SEED_CHECKSUM,
  PROVINCE_SEED_ROW_COUNT,
} from './province-seed.generated';
import {
  checksumProvinces,
  parseProvincesCsv,
  type ProvinceRow,
} from './province-rows';

const csv = readFileSync(repoPath('docs/provinces.csv'), 'utf-8');

describe('docs/provinces.csv', () => {
  const rows = parseProvincesCsv(csv);

  it('holds 77 provinces, each once', () => {
    expect(rows).toHaveLength(77);
    expect(new Set(rows.map((r) => r.provinceId)).size).toBe(77);
  });

  it('keeps every province code two digits, in 10-96', () => {
    for (const { provinceId } of rows) {
      expect(provinceId).toMatch(/^\d{2}$/);
      expect(Number(provinceId)).toBeGreaterThanOrEqual(10);
      expect(Number(provinceId)).toBeLessThanOrEqual(96);
    }
  });

  it('assigns every province one of the 13 health regions', () => {
    for (const { healthRegion } of rows) {
      expect(healthRegion).toBeGreaterThanOrEqual(1);
      expect(healthRegion).toBeLessThanOrEqual(13);
    }
  });
});

describe('checksumProvinces', () => {
  const a: ProvinceRow = { provinceId: '10', nameTh: 'ก', healthRegion: 13 };
  const b: ProvinceRow = { provinceId: '11', nameTh: 'ข', healthRegion: 6 };

  it('does not depend on row order', () => {
    expect(checksumProvinces([a, b])).toBe(checksumProvinces([b, a]));
  });

  it('changes when one province is moved to another health region', () => {
    expect(checksumProvinces([a, b])).not.toBe(
      checksumProvinces([a, { ...b, healthRegion: 7 }]),
    );
  });
});

describe('the generated province seed', () => {
  it('is what the CSV generates: regenerate with `pnpm db:generate-province-seed`', () => {
    const rows = parseProvincesCsv(csv);

    expect(readFileSync(apiPath(PROVINCE_SEED_MIGRATION), 'utf-8')).toBe(
      provinceSeedMigrationSql(rows),
    );
    expect(
      readFileSync(
        apiPath('src/reference/province-seed.generated.ts'),
        'utf-8',
      ),
    ).toBe(provinceSeedModuleSource(rows));
  });

  it('pins the row count and checksum the boot check asserts', () => {
    const rows = parseProvincesCsv(csv);

    expect(PROVINCE_SEED_ROW_COUNT).toBe(rows.length);
    expect(PROVINCE_SEED_CHECKSUM).toBe(checksumProvinces(rows));
  });
});
