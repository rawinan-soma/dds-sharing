import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { writeExtract } from './extract-writer';

const HEADER = ['a', 'diagnosis_icd10', 'diagnosis_icd10_list', 'd'] as const;
// `diagnosis_icd10` and `diagnosis_icd10_list` sit at positions 1 and 2.
const UPPERCASE_COLUMNS = [1, 2];

describe('writeExtract', () => {
  it('rule 1: emits a UTF-8 BOM as the first three bytes', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('rule 2: uses CRLF line endings, never LF alone', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['1', 'a150', 'a150,b200', '2025-01-01']],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const text = bytes.toString('utf-8');
    expect(text).toContain('\r\n');
    // No bare LF anywhere once every CRLF pair is stripped out.
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('rule 3: writes an empty cell bare, never as a quoted empty string', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['1', '', 'a150', '2025-01-01']],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    expect(line).toBe('1,,A150,2025-01-01');
  });

  it('rule 4: trims leading and trailing whitespace from every value', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [[' 1 ', '  a150', 'a150  ', ' 2025-01-01 ']],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    expect(line).toBe('1,A150,A150,2025-01-01');
  });

  it('rule 4: a whitespace-only value becomes a bare empty cell, not a quoted run of spaces', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['1', '   ', 'a150', '2025-01-01']],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    expect(line).toBe('1,,A150,2025-01-01');
  });

  it('rule 5: quotes only on comma, double-quote, CR or LF, escaping quotes by doubling', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['plain', 'a150,b200', 'has "quotes"', 'line\nbreak']],
      uppercaseColumns: [],
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    expect(line).toBe('plain,"a150,b200","has ""quotes""","line\nbreak"');
  });

  it('rule 5: an ordinary value is never quoted', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['A150', 'plain-value', 'x', 'y']],
      uppercaseColumns: [],
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    expect(line).not.toContain('"');
  });

  it('rule 6: uppercase-normalises only the given positions', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['a150', 'a150', 'a150,b200', 'a150']],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    // Position 0 and 3 are untouched; positions 1 and 2 are uppercased.
    expect(line).toBe('a150,A150,"A150,B200",a150');
  });

  it('rule 7: emits the header once, in the given order, untouched by uppercase-normalisation', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [
        ['1', 'a150', 'a150', '2025-01-01'],
        ['2', 'a151', 'a151', '2025-01-02'],
      ],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const lines = bytes.toString('utf-8').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('﻿' + HEADER.join(','));
    expect(lines).toHaveLength(3);
  });

  it('reports row and column counts', () => {
    const { rowCount, columnCount } = writeExtract({
      header: HEADER,
      rows: [
        ['1', 'a', 'b', 'c'],
        ['2', 'a', 'b', 'c'],
        ['3', 'a', 'b', 'c'],
      ],
      uppercaseColumns: [],
    });
    expect(rowCount).toBe(3);
    expect(columnCount).toBe(4);
  });

  // spec §17.1, NFR-30 test 1: writing the same rows twice yields one checksum,
  // and the bytes begin with the BOM and use CRLF.
  it('is reproducible: the same rows written twice yield byte-identical output and one checksum', () => {
    const rows = [
      ['1', 'a150', 'a150,b200', '2025-01-01'],
      ['2', '', 'a151', ''],
    ];
    const first = writeExtract({
      header: HEADER,
      rows,
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const second = writeExtract({
      header: HEADER,
      rows,
      uppercaseColumns: UPPERCASE_COLUMNS,
    });

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.sha256).toBe(second.sha256);
    expect(first.sha256).toBe(
      createHash('sha256').update(first.bytes).digest('hex'),
    );
    expect([...first.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(first.bytes.toString('utf-8')).toContain('\r\n');
  });

  // spec §17.1, NFR-30 test 2: a row whose `diagnosis_icd10_list` holds two
  // comma-delimited codes round-trips through the writer as one quoted field.
  it('quotes a multi-code diagnosis_icd10_list as a single field', () => {
    const { bytes } = writeExtract({
      header: HEADER,
      rows: [['1', 'a150', 'a150,b200', '2025-01-01']],
      uppercaseColumns: UPPERCASE_COLUMNS,
    });
    const line = bytes.toString('utf-8').split('\r\n')[1];
    expect(line).toBe('1,A150,"A150,B200",2025-01-01');
  });
});
