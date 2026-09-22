// The Extract writer (spec §8.2, ADR 0009): hand-rolled, no CSV library. It
// emits the header once, applies all eight writer rules, and accumulates the
// SHA-256 fingerprint in the same pass the bytes are built in — never a
// second read over the finished file (spec §8.4).
//
// The writer takes rows already ordered and positional (`string[]`), never a
// named record: no column name appears in this file. Rule 6's two named
// columns are named by the caller (`extract-assembly.ts`), as positions.
//
// This is a deliberate, conditional trade against a CSV library (ADR 0009):
// a library expresses these rules as configuration a minor release is free to
// change, which would move the fingerprint of rows that never changed. The
// condition is `extract-writer.spec.ts`'s reproducibility and quoting tests
// (spec §17.1, NFR-30) — without them this file is just an undefended
// reimplementation of what the library already tests.

import { createHash } from 'node:crypto';

/** The 3-byte UTF-8 byte-order mark (rule 1) — exported so the Data
 * dictionary's generator can prefix the same bytes onto its own shipped file,
 * without re-literalling them. */
export const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CRLF = '\r\n';
// Rule 5: RFC 4180 minimal quoting — quote only on comma, double-quote, CR or LF.
const NEEDS_QUOTING = /[",\r\n]/;

function escapeCell(raw: string): string {
  // Rule 4: trim first, so a whitespace-only value becomes a bare empty cell
  // (rule 3) rather than a quoted run of spaces.
  const trimmed = raw.trim();
  if (!NEEDS_QUOTING.test(trimmed)) return trimmed;
  return `"${trimmed.replaceAll('"', '""')}"`;
}

export interface ExtractWriterInput {
  /** The header row, English names, emitted once (rule 7). */
  header: readonly string[];
  /** Data rows, already in the Extract's row order. */
  rows: Iterable<readonly string[]>;
  /**
   * Positions to uppercase-normalise before trimming and quoting (rule 6).
   * Never applied to the header. The writer holds no opinion on what these
   * positions mean — the caller names them.
   */
  uppercaseColumns: readonly number[];
}

export interface WrittenExtract {
  /** UTF-8 with BOM, CRLF line endings — the Extract exactly as it will be
   * zipped (spec §8.1). */
  bytes: Buffer;
  /** SHA-256 of `bytes`, hex-encoded (spec §8.4). */
  sha256: string;
  rowCount: number;
  columnCount: number;
}

export function writeExtract(input: ExtractWriterInput): WrittenExtract {
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];

  const emit = (text: string) => {
    const buf = Buffer.from(text, 'utf-8');
    chunks.push(buf);
    hash.update(buf);
  };

  chunks.push(BOM);
  hash.update(BOM);

  emit(input.header.map(escapeCell).join(',') + CRLF);

  const upper = new Set(input.uppercaseColumns);
  let rowCount = 0;
  for (const row of input.rows) {
    emit(
      row
        .map((cell, i) => escapeCell(upper.has(i) ? cell.toUpperCase() : cell))
        .join(',') + CRLF,
    );
    rowCount += 1;
  }

  return {
    bytes: Buffer.concat(chunks),
    sha256: hash.digest('hex'),
    rowCount,
    columnCount: input.header.length,
  };
}
