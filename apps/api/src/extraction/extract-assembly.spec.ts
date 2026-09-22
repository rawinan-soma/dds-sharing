import { describe, expect, it } from 'vitest';
import {
  assembleExtractRows,
  EXTRACT_HEADER,
  UPPERCASE_COLUMN_INDEXES,
} from './extract-assembly';
import { PROJECT_COLUMNS, type ProjectedRow } from './project';

function row(overrides: Partial<Record<string, string>>): ProjectedRow {
  const base = Object.fromEntries(PROJECT_COLUMNS.map((c) => [c, '']));
  return { ...base, ...overrides } as ProjectedRow;
}

describe('EXTRACT_HEADER', () => {
  it('is the fixed 23-column allowlist, in order', () => {
    expect(EXTRACT_HEADER).toEqual(PROJECT_COLUMNS);
  });
});

describe('UPPERCASE_COLUMN_INDEXES', () => {
  it('points at diagnosis_icd10 and diagnosis_icd10_list, and nothing else', () => {
    expect(UPPERCASE_COLUMN_INDEXES).toEqual([
      PROJECT_COLUMNS.indexOf('diagnosis_icd10'),
      PROJECT_COLUMNS.indexOf('diagnosis_icd10_list'),
    ]);
  });
});

describe('assembleExtractRows', () => {
  it('yields rows in code order, then fetch order within a code', () => {
    const rowsByCode = {
      '202': [
        row({ epidem_report_guid: '202-a' }),
        row({ epidem_report_guid: '202-b' }),
      ],
      '203': [row({ epidem_report_guid: '203-a' })],
    };

    const guids = [...assembleExtractRows(rowsByCode, ['202', '203'])].map(
      (r) => r[PROJECT_COLUMNS.indexOf('epidem_report_guid')],
    );

    expect(guids).toEqual(['202-a', '202-b', '203-a']);
  });

  it('respects the caller-given code order, ascending or not', () => {
    const rowsByCode = {
      '203': [row({ epidem_report_guid: '203-a' })],
      '202': [row({ epidem_report_guid: '202-a' })],
    };

    const guids = [...assembleExtractRows(rowsByCode, ['203', '202'])].map(
      (r) => r[PROJECT_COLUMNS.indexOf('epidem_report_guid')],
    );

    expect(guids).toEqual(['203-a', '202-a']);
  });

  it('emits every column in PROJECT_COLUMNS order, positionally', () => {
    const rowsByCode = {
      '202': [row({ epidem_report_guid: 'g', diagnosis_icd10: 'a150' })],
    };

    const [assembled] = [...assembleExtractRows(rowsByCode, ['202'])];

    expect(assembled).toHaveLength(PROJECT_COLUMNS.length);
    expect(assembled[PROJECT_COLUMNS.indexOf('epidem_report_guid')]).toBe('g');
    expect(assembled[PROJECT_COLUMNS.indexOf('diagnosis_icd10')]).toBe('a150');
  });

  it('treats a code with no rows as contributing nothing, not an error', () => {
    const guids = [...assembleExtractRows({}, ['999'])];
    expect(guids).toEqual([]);
  });
});
