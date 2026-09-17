import { createHash } from "node:crypto";
import { EXTRACT_COLUMNS, type ExtractColumn } from "./allowlist.js";
import { CRLF, formatCsvField, UTF8_BOM } from "./csv-format.js";
import type { ProjectedRow } from "./project.js";

/** Rule 6, and nothing else (spec §8.2) — a blanket `.upper()` is how a writer starts inventing data. */
const UPPERCASE_COLUMNS: ReadonlySet<ExtractColumn> = new Set([
  "diagnosis_icd10",
  "diagnosis_icd10_list",
]);

export interface ExtractWriteResult {
  /** The Extract's full bytes, BOM included. */
  csv: Buffer;
  /** SHA-256 of `csv`, accumulated in the same pass it was built (spec §8.4). */
  sha256: string;
  rowCount: number;
  columnCount: number;
}

function formatCell(column: ExtractColumn, value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  text = text.trim(); // rule 4 — the load-bearing half of rules 3+4
  if (UPPERCASE_COLUMNS.has(column)) text = text.toUpperCase();
  return formatCsvField(text);
}

/**
 * The Extract writer (ADR 0009): hand-written, no CSV library. It receives
 * project's fixed, ordered rows and carries no column semantics beyond
 * rule 6's two named columns — everything else here is generic RFC 4180
 * formatting. Emits the header once, applies rules 1-7 byte for byte, and
 * accumulates the SHA-256 in the same pass the bytes are built, so a
 * dependency upgrade can never change the fingerprint.
 *
 * Rule 2 is the one to fear: CRLF is fixed here regardless of the host OS.
 * Never replace this with `os.EOL`, `os.linesep`, or a library default —
 * NFR-30 test 1 exists because that mistake is otherwise invisible on a
 * developer's own machine.
 */
export function writeExtractCsv(rows: readonly ProjectedRow[]): ExtractWriteResult {
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];

  const emit = (buf: Buffer): void => {
    chunks.push(buf);
    hash.update(buf);
  };

  emit(UTF8_BOM);
  emit(Buffer.from(EXTRACT_COLUMNS.join(",") + CRLF, "utf8"));

  for (const row of rows) {
    const line = EXTRACT_COLUMNS.map((column) => formatCell(column, row[column])).join(",");
    emit(Buffer.from(line + CRLF, "utf8"));
  }

  const csv = Buffer.concat(chunks);

  return {
    csv,
    sha256: hash.digest("hex"),
    // Counted from the bytes actually emitted, never echoed back from
    // `rows.length` — a `for...of` over `rows` always iterates exactly
    // `rows.length` times, so trusting that count here would make FR-13
    // step 6's line-count assert (`extraction.processor.ts`) compare a
    // value to itself and never catch a bug in the emit loop above.
    rowCount: countCsvDataLines(csv),
    columnCount: EXTRACT_COLUMNS.length,
  };
}

/**
 * CRLF-terminated lines in `csv`, minus the header (spec §7.9 step 6,
 * §8.1). Quote-aware: rule 5 allows a value to carry an embedded CR/LF
 * inside a quoted field, and a naive byte scan for `\r\n` would count that
 * as a record separator too.
 */
function countCsvDataLines(csv: Buffer): number {
  const text = csv.toString("utf8");
  let inQuotes = false;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++; // an escaped quote, not a close-then-reopen
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === "\r" && text[i + 1] === "\n") {
      lines++;
      i++; // skip the \n half of the pair
    }
  }
  return Math.max(lines - 1, 0);
}
