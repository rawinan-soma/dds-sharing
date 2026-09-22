import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildExtractArchive } from './build-extract-archive';
import { PROJECT_COLUMNS, type ProjectedRow } from './project';
import { readZipEntries as readEntries } from './test-support/read-zip-entries';

function row(overrides: Partial<Record<string, string>>): ProjectedRow {
  const base = Object.fromEntries(PROJECT_COLUMNS.map((c) => [c, '']));
  return { ...base, ...overrides } as ProjectedRow;
}

describe('buildExtractArchive', () => {
  it('names the archive and the CSV entry from the submit moment', async () => {
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    const result = await buildExtractArchive({
      rowsByCode: {},
      codes: [],
      submittedAt,
      runNumber: 1,
    });

    expect(result.archiveFilename).toBe(
      'dds-envocc-sharing-20260114-170503.zip',
    );

    const entries = await readEntries(result.archiveBytes);
    expect(entries.map((e) => e.fileName)).toEqual(
      expect.arrayContaining(['dds-envocc-sharing-20260114-170503.csv']),
    );
  });

  it('the zip entry holds exactly the fingerprinted Extract bytes', async () => {
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    const rowsByCode = {
      '202': [row({ epidem_report_guid: 'g1', diagnosis_icd10: 'a150' })],
    };
    const result = await buildExtractArchive({
      rowsByCode,
      codes: ['202'],
      submittedAt,
      runNumber: 1,
    });

    const entries = await readEntries(result.archiveBytes);
    const csvEntry = entries.find(
      (e) => e.fileName === 'dds-envocc-sharing-20260114-170503.csv',
    )!;

    expect(csvEntry.content.length).toBe(result.csvBytes);
    expect(createHash('sha256').update(csvEntry.content).digest('hex')).toBe(
      result.csvSha256,
    );
    expect(csvEntry.content.toString('utf-8')).toContain('A150');
  });

  it('reports row and column counts across codes, in fetch order', async () => {
    const rowsByCode = {
      '202': [
        row({ epidem_report_guid: 'a' }),
        row({ epidem_report_guid: 'b' }),
      ],
      '203': [row({ epidem_report_guid: 'c' })],
    };
    const result = await buildExtractArchive({
      rowsByCode,
      codes: ['202', '203'],
      submittedAt: new Date('2026-01-14T10:05:03.000Z'),
      runNumber: 1,
    });

    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(PROJECT_COLUMNS.length);
  });

  it('a Re-run suffixes both the archive and the CSV entry filename', async () => {
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    const result = await buildExtractArchive({
      rowsByCode: {},
      codes: [],
      submittedAt,
      runNumber: 2,
    });

    expect(result.archiveFilename).toBe(
      'dds-envocc-sharing-20260114-170503-r2.zip',
    );
    const entries = await readEntries(result.archiveBytes);
    expect(entries.map((e) => e.fileName)).toEqual(
      expect.arrayContaining(['dds-envocc-sharing-20260114-170503-r2.csv']),
    );
  });
});
