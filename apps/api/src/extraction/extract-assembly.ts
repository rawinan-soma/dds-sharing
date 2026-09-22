// Bridges the pipeline's named rows (`ProjectedRow`, keyed by column) into
// `extract-writer.ts`'s positional input. This is the one place rule 6's two
// column names are read: the writer itself carries no column semantics (spec
// §8.2), so naming which positions to uppercase happens here, in assembly,
// not there.

import { PROJECT_COLUMNS, type ProjectedRow } from './project';

const UPPERCASE_COLUMNS = ['diagnosis_icd10', 'diagnosis_icd10_list'] as const;

export const EXTRACT_HEADER: readonly string[] = PROJECT_COLUMNS;

export const UPPERCASE_COLUMN_INDEXES: readonly number[] =
  UPPERCASE_COLUMNS.map((column) => PROJECT_COLUMNS.indexOf(column));

/**
 * Rows in the Extract's row order (spec §8.1): `codes` ascending, then each
 * code's rows in fetch order. `codes` is the caller's already-sorted list
 * (`ExtractionSummary.reportCodes`) — this function holds no ordering
 * decision of its own.
 */
export function* assembleExtractRows(
  rowsByCode: Readonly<Record<string, readonly ProjectedRow[]>>,
  codes: readonly string[],
): Generator<readonly string[]> {
  for (const code of codes) {
    for (const row of rowsByCode[code] ?? []) {
      yield PROJECT_COLUMNS.map((column) => row[column]);
    }
  }
}
