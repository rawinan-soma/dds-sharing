import { describe, it, expect } from "vitest";
import {
  assertProvinceSeedIntegrity,
  computeProvinceChecksum,
  type ProvinceRow,
} from "./province-integrity.js";

const ROWS: ProvinceRow[] = [
  { provinceId: "10", nameTh: "กรุงเทพมหานคร", healthRegion: 13 },
  { provinceId: "11", nameTh: "สมุทรปราการ", healthRegion: 6 },
  { provinceId: "12", nameTh: "นนทบุรี", healthRegion: 4 },
];

describe("computeProvinceChecksum", () => {
  it("is stable regardless of input row order", () => {
    const forward = computeProvinceChecksum(ROWS);
    const reversed = computeProvinceChecksum([...ROWS].reverse());
    expect(forward).toBe(reversed);
  });

  it("changes when a single field on a single row changes", () => {
    const original = computeProvinceChecksum(ROWS);
    const corrupted = computeProvinceChecksum([
      ROWS[0],
      { ...ROWS[1], healthRegion: 99 },
      ROWS[2],
    ]);
    expect(corrupted).not.toBe(original);
  });
});

describe("assertProvinceSeedIntegrity", () => {
  const expected = {
    rowCount: ROWS.length,
    checksum: computeProvinceChecksum(ROWS),
  };

  it("does not throw when the table matches the expected seed", () => {
    expect(() => assertProvinceSeedIntegrity(ROWS, expected)).not.toThrow();
  });

  it("throws on a row-count mismatch (a half-applied seed)", () => {
    expect(() =>
      assertProvinceSeedIntegrity(ROWS.slice(0, 2), expected),
    ).toThrow(/expected 3 rows, found 2/);
  });

  it("throws on a checksum mismatch even when the row count is correct", () => {
    const tampered = [ROWS[0], { ...ROWS[1], healthRegion: 99 }, ROWS[2]];
    expect(() => assertProvinceSeedIntegrity(tampered, expected)).toThrow(
      /checksum mismatch/,
    );
  });
});
