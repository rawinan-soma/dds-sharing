// Orchestrates the writer, the assembly step and the zip into one Extract
// archive (spec §8): everything the worker needs to upload and to fill
// `job_completed`'s fingerprint group.

import { archiveFilename, extractFilename } from './archive-naming';
import {
  assembleExtractRows,
  EXTRACT_HEADER,
  UPPERCASE_COLUMN_INDEXES,
} from './extract-assembly';
import { buildArchive } from './extract-archive';
import { writeExtract } from './extract-writer';
import { type ProjectedRow } from './project';

export interface BuildExtractArchiveInput {
  rowsByCode: Readonly<Record<string, readonly ProjectedRow[]>>;
  /** Fetch order: Report code ascending (spec §8.1). */
  codes: readonly string[];
  /** The Request's submit moment — the archive name's anchor (spec §8.3). */
  submittedAt: Date;
  /** 1 for the original run; a Re-run (#74) passes 2, 3, ... */
  runNumber: number;
}

export interface BuiltExtractArchive {
  archiveBytes: Buffer;
  archiveFilename: string;
  /** SHA-256 of the Extract (the CSV), before the zip step (spec §8.4). */
  csvSha256: string;
  csvBytes: number;
  rowCount: number;
  columnCount: number;
}

export async function buildExtractArchive(
  input: BuildExtractArchiveInput,
): Promise<BuiltExtractArchive> {
  const written = writeExtract({
    header: EXTRACT_HEADER,
    rows: assembleExtractRows(input.rowsByCode, input.codes),
    uppercaseColumns: UPPERCASE_COLUMN_INDEXES,
  });

  const archiveBytes = await buildArchive({
    fileName: extractFilename(input.submittedAt, input.runNumber),
    bytes: written.bytes,
  });

  return {
    archiveBytes,
    archiveFilename: archiveFilename(input.submittedAt, input.runNumber),
    csvSha256: written.sha256,
    csvBytes: written.bytes.length,
    rowCount: written.rowCount,
    columnCount: written.columnCount,
  };
}
