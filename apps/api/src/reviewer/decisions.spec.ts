import { describe, expect, it } from 'vitest';
import { buildSnapshot, noteIsValid } from './decisions';

describe('noteIsValid (§10.3)', () => {
  it('rejects a note shorter than 10 characters', () => {
    expect(noteIsValid('too short')).toBe(false);
  });

  it('accepts a note of exactly 10 characters', () => {
    expect(noteIsValid('1234567890')).toBe(true);
  });

  it('trims whitespace before counting: padding is not content', () => {
    expect(noteIsValid('   short   ')).toBe(false);
    expect(noteIsValid('  1234567890  ')).toBe(true);
  });

  it('rejects an empty or whitespace-only note', () => {
    expect(noteIsValid('')).toBe(false);
    expect(noteIsValid('          ')).toBe(false);
  });
});

describe('buildSnapshot (§12.3)', () => {
  const source = {
    diseaseGroupName: 'โรคซิลิโคสิส',
    reportCodes: ['202', '203'],
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    provinces: ['50'],
    workplace: 'Regional Office 1',
  };

  it('copies the ask and the workplace, over the report codes it expanded to', () => {
    expect(buildSnapshot(source, 129)).toEqual({
      diseaseGroupName: 'โรคซิลิโคสิส',
      reportCodes: ['202', '203'],
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      provinces: ['50'],
      probeRowCount: 129,
      workplace: 'Regional Office 1',
    });
  });

  it.each(['pending', 'failed'] as const)(
    'copies a count that was %s on screen as exactly that',
    (rowCount) => {
      expect(buildSnapshot(source, rowCount).probeRowCount).toBe(rowCount);
    },
  );

  it('never copies a contact field: the source has none to leak', () => {
    const keys = Object.keys(buildSnapshot(source, 129));
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('tel');
    expect(keys).not.toContain('email');
  });

  it('copies arrays rather than aliasing them', () => {
    const codes = ['202'];
    const snapshot = buildSnapshot({ ...source, reportCodes: codes }, 129);
    codes.push('203');
    expect(snapshot.reportCodes).toEqual(['202']);
  });
});
