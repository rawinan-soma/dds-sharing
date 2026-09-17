import { describe, expect, it } from "vitest";
import { EXTRACT_COLUMNS } from "./allowlist.js";
import { writeExtractCsv, type ExtractWriteResult } from "./extract-writer.js";
import type { ProjectedRow } from "./project.js";

function row(overrides: Partial<ProjectedRow>): ProjectedRow {
  const base = {} as ProjectedRow;
  for (const column of EXTRACT_COLUMNS) base[column] = null;
  return { ...base, ...overrides };
}

/** A minimal RFC 4180-aware line splitter — `dataLine.split(",")` breaks on
 * a quoted field that itself contains a comma, which is exactly the case
 * several of these tests need to assert on. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

describe("writeExtractCsv (spec §8.2, ADR 0009)", () => {
  it("emits the header exactly once, in the fixed column order", () => {
    const { csv } = writeExtractCsv([]);
    // Strip the 3-byte BOM before comparing text — it is asserted on its
    // own in the "rule 1" test below.
    const text = csv.subarray(3).toString("utf8");
    const lines = text.split("\r\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(EXTRACT_COLUMNS.join(","));
  });

  it("rule 1: the bytes begin with the UTF-8 BOM", () => {
    const { csv } = writeExtractCsv([]);
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("rule 2: lines are CRLF-terminated, never bare LF", () => {
    const { csv } = writeExtractCsv([row({ epidem_report_guid: "g1" })]);
    const text = csv.toString("utf8");
    expect(text).toContain("\r\n");
    // Every line ending is CRLF — a bare `\n` never appears on its own.
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("rule 3: an absent value is written as a bare empty cell, never \"\"\"\"", () => {
    const { csv } = writeExtractCsv([row({ epidem_report_guid: "g1", gender: null })]);
    const dataLine = csv.toString("utf8").split("\r\n")[1];
    const cells = dataLine.split(",");
    const genderIndex = EXTRACT_COLUMNS.indexOf("gender");
    expect(cells[genderIndex]).toBe("");
  });

  it("rule 4: leading and trailing whitespace is trimmed from every value", () => {
    const { csv } = writeExtractCsv([row({ epidem_report_guid: "  g1  " })]);
    const dataLine = csv.toString("utf8").split("\r\n")[1];
    expect(dataLine.split(",")[0]).toBe("g1");
  });

  it("rule 5: RFC 4180 minimal quoting — a comma forces quoting and doubles embedded quotes", () => {
    const { csv } = writeExtractCsv([row({ epidem_report_guid: 'a,b"c' })]);
    const dataLine = csv.toString("utf8").split("\r\n")[1];
    expect(parseCsvLine(dataLine)[0]).toBe('a,b"c');
    // The raw bytes actually shipped are the quoted, doubled-quote form.
    expect(dataLine.startsWith('"a,b""c"')).toBe(true);
  });

  it("rule 5: a plain value is never quoted", () => {
    const { csv } = writeExtractCsv([row({ epidem_report_guid: "plain-value" })]);
    const dataLine = csv.toString("utf8").split("\r\n")[1];
    expect(dataLine.split(",")[0]).toBe("plain-value");
  });

  it("rule 6: uppercases diagnosis_icd10 and diagnosis_icd10_list only", () => {
    const { csv } = writeExtractCsv([
      row({
        epidem_report_guid: "g1",
        diagnosis_icd10: "a150",
        diagnosis_icd10_list: "a150",
        prefix: "mr", // any other column must survive un-cased
      }),
    ]);
    const dataLine = csv.toString("utf8").split("\r\n")[1];
    const cells = dataLine.split(",");
    expect(cells[EXTRACT_COLUMNS.indexOf("diagnosis_icd10")]).toBe("A150");
    expect(cells[EXTRACT_COLUMNS.indexOf("diagnosis_icd10_list")]).toBe("A150");
    expect(cells[EXTRACT_COLUMNS.indexOf("prefix")]).toBe("mr");
  });

  it("NFR-30 test 2: a diagnosis_icd10_list of two comma-delimited codes round-trips as one quoted field", () => {
    const { csv } = writeExtractCsv([
      row({ epidem_report_guid: "g1", diagnosis_icd10_list: "a150,b241" }),
    ]);
    const dataLine = csv.toString("utf8").split("\r\n")[1];
    // The delimiter is a comma (§17.2) — the raw bytes quote the field so a
    // naive split on "," never sees it as two cells.
    expect(dataLine).toContain('"A150,B241"');
    // A correct RFC 4180 parse still recovers exactly EXTRACT_COLUMNS.length
    // cells, with the pair intact as one value.
    const cells = parseCsvLine(dataLine);
    expect(cells).toHaveLength(EXTRACT_COLUMNS.length);
    expect(cells[EXTRACT_COLUMNS.indexOf("diagnosis_icd10_list")]).toBe("A150,B241");
  });

  it("NFR-30 test 1: writing the same rows twice on this host yields one checksum", () => {
    const rows = [
      row({ epidem_report_guid: "g1", diagnosis_icd10: "a150" }),
      row({ epidem_report_guid: "g2", diagnosis_icd10_list: "b241,c150" }),
    ];
    const first: ExtractWriteResult = writeExtractCsv(rows);
    const second: ExtractWriteResult = writeExtractCsv(rows);
    expect(second.sha256).toBe(first.sha256);
    expect(second.csv.equals(first.csv)).toBe(true);
  });

  it("zero rows produce a valid header-only Extract", () => {
    const result = writeExtractCsv([]);
    expect(result.rowCount).toBe(0);
    expect(result.columnCount).toBe(EXTRACT_COLUMNS.length);
    expect(result.csv.toString("utf8").split("\r\n").filter(Boolean)).toHaveLength(1);
  });

  it("reports rowCount and columnCount matching the input", () => {
    const result = writeExtractCsv([row({}), row({}), row({})]);
    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(EXTRACT_COLUMNS.length);
  });
});
