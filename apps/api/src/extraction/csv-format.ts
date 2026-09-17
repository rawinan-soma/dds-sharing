/**
 * Byte-level CSV primitives shared by the Extract writer and the Data
 * dictionary builder (ADR 0009, spec §8.2). Kept separate from
 * `extract-writer.ts` because the Data dictionary is not the Extract and
 * must never gain column semantics of its own — it only needs the same
 * bare-cell, minimal-quoting mechanics.
 */

/** Fixed regardless of host OS (spec §8.2 rule 2). Never `os.EOL`. */
export const CRLF = "\r\n";

/** The 3-byte UTF-8 BOM (spec §8.2 rule 1) — inside the file, and therefore inside any fingerprint taken over it. */
export const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * RFC 4180 minimal quoting (spec §8.2 rule 5): quote only when the field
 * contains a comma, a double quote, or a CR/LF. An empty string is returned
 * bare — never `""` (rule 3).
 */
export function formatCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
