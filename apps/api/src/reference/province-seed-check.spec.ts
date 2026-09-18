import { describe, expect, it } from 'vitest';
import { checksumProvinces, type ProvinceRow } from './province-rows';
import { assertProvinceSeed } from './province-seed-check';

const rows: ProvinceRow[] = [
  { provinceId: '10', nameTh: 'ก', healthRegion: 13 },
  { provinceId: '11', nameTh: 'ข', healthRegion: 6 },
];
const expected = { rowCount: 2, checksum: checksumProvinces(rows) };

describe('assertProvinceSeed', () => {
  it('returns the checksum of a table that matches the seed', () => {
    expect(assertProvinceSeed(rows, expected)).toBe(expected.checksum);
  });

  it('fails on a missing row, naming the counts', () => {
    expect(() => assertProvinceSeed(rows.slice(1), expected)).toThrow(
      /1 rows.*expected 2/,
    );
  });

  it('fails on one province in the wrong health region, with the row count right', () => {
    const drifted = [rows[0], { ...rows[1], healthRegion: 7 }];

    expect(() => assertProvinceSeed(drifted, expected)).toThrow(/checksum/);
  });
});
