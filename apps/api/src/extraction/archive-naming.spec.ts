import { describe, expect, it } from 'vitest';
import {
  archiveFilename,
  archiveStem,
  extractFilename,
} from './archive-naming';

describe('archive naming', () => {
  it('names the archive from the submit moment in Asia/Bangkok, run 1 carrying no suffix', () => {
    // 2026-01-14T10:05:03Z is 2026-01-14T17:05:03+07:00.
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    expect(archiveFilename(submittedAt, 1)).toBe(
      'dds-envocc-sharing-20260114-170503.zip',
    );
  });

  it('the CSV shares the archive stem, with .csv instead of .zip', () => {
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    expect(extractFilename(submittedAt, 1)).toBe(
      'dds-envocc-sharing-20260114-170503.csv',
    );
  });

  it('a Re-run carries a -rN suffix, run 2 onward', () => {
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    expect(archiveStem(submittedAt, 2)).toBe(
      'dds-envocc-sharing-20260114-170503-r2',
    );
    expect(archiveStem(submittedAt, 3)).toBe(
      'dds-envocc-sharing-20260114-170503-r3',
    );
  });

  it('carries no reference number anywhere in the name', () => {
    const submittedAt = new Date('2026-01-14T10:05:03.000Z');
    expect(archiveFilename(submittedAt, 1)).not.toMatch(/REQ-/);
  });

  it('crosses midnight correctly when the UTC and Bangkok dates differ', () => {
    // 2026-01-14T18:30:00Z is 2026-01-15T01:30:00+07:00 — the next day in Bangkok.
    const submittedAt = new Date('2026-01-14T18:30:00.000Z');
    expect(archiveStem(submittedAt, 1)).toBe(
      'dds-envocc-sharing-20260115-013000',
    );
  });
});
