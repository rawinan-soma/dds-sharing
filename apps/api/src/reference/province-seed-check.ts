import { checksumProvinces, type ProvinceRow } from './province-rows';

export interface ProvinceSeedExpectation {
  rowCount: number;
  checksum: string;
}

// A half-applied or drifted seed would blank the derived health-region column
// for every row of a job, so this is a boot failure, never a warning (§6.4).
// Returns the table's checksum, which later joins the job-completion event.
export function assertProvinceSeed(
  rows: readonly ProvinceRow[],
  expected: ProvinceSeedExpectation,
): string {
  if (rows.length !== expected.rowCount) {
    throw new Error(
      `The province table has ${rows.length} rows, expected ${expected.rowCount}: the seed migration did not apply cleanly`,
    );
  }

  const checksum = checksumProvinces(rows);
  if (checksum !== expected.checksum) {
    throw new Error(
      `The province table checksum ${checksum} does not match the seed's ${expected.checksum}: the database disagrees with docs/provinces.csv`,
    );
  }

  return checksum;
}
