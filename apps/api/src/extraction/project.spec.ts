import { describe, expect, it } from 'vitest';
import { KNOWN_UPSTREAM_FIELDS } from './known-upstream-fields';
import {
  newProjectCounters,
  PROJECT_COLUMNS,
  projectRow,
  StaleProvinceTableError,
} from './project';

const PROVINCES = new Map([
  ['10', 1],
  ['96', 13],
]);
const NOW = new Date('2026-01-01T00:00:00Z');

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    epidem_report_guid: 'GUID-1',
    epidem_report_group_code: 999, // must never be trusted (spec §4.6)
    diagnosis_icd10: 'J60',
    diagnosis_icd10_list: 'J60,J61',
    birth_date: '2000-01-01',
    gender: 'M',
    prefix: 'Mr',
    nationality: 'TH',
    occupation: '1',
    marital_status_id: 1,
    chw_code: 10,
    amp_code: 1001,
    epidem_chw_code: 10,
    epidem_amp_code: 1001,
    hospital_code: '00001',
    onset_date: '2025-06-15',
    treated_date: '2025-06-16',
    diagnosis_date: '2025-06-16',
    death_date: null,
    report_datetime: '2025-06-16T00:00:00',
    update_datetime: '2025-06-16T00:00:00',
    ...overrides,
  };
}

describe('PROJECT_COLUMNS', () => {
  it('is exactly the fixed 23 columns, in the fixed order', () => {
    expect(PROJECT_COLUMNS).toEqual([
      'epidem_report_guid',
      'epidem_report_group_code',
      'diagnosis_icd10',
      'diagnosis_icd10_list',
      'birth_date',
      'gender',
      'prefix',
      'nationality',
      'occupation',
      'marital_status_id',
      'chw_code',
      'amp_code',
      'epidem_chw_code',
      'epidem_health_zone',
      'epidem_amp_code',
      'hospital_code',
      'onset_date',
      'onset_age',
      'treated_date',
      'diagnosis_date',
      'death_date',
      'report_datetime',
      'update_datetime',
    ]);
  });
});

describe('projectRow', () => {
  it('fills column 2 from the fetched groupCode, never from the response field', () => {
    const counters = newProjectCounters();
    const projected = projectRow(baseRow(), '201', PROVINCES, NOW, counters);
    expect(projected.epidem_report_group_code).toBe('201');
  });

  it('passes through a plain upstream field verbatim, stringified', () => {
    const counters = newProjectCounters();
    const projected = projectRow(baseRow(), '201', PROVINCES, NOW, counters);
    expect(projected.diagnosis_icd10).toBe('J60');
    expect(projected.marital_status_id).toBe('1');
  });

  it('emits an empty cell for a missing upstream key, never throwing', () => {
    const counters = newProjectCounters();
    const row = baseRow();
    delete (row as Record<string, unknown>).nationality;
    const projected = projectRow(row, '201', PROVINCES, NOW, counters);
    expect(projected.nationality).toBe('');
  });

  describe('onset_age', () => {
    it('computes completed years at onset_date, not at submission', () => {
      const counters = newProjectCounters();
      const row = baseRow({
        birth_date: '2000-06-20',
        onset_date: '2025-06-15',
      });
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      // Birthday (06-20) has not happened yet by onset (06-15): 24, not 25.
      expect(projected.onset_age).toBe('24');
      expect(counters.impossibleDerivationInputs).toBe(0);
    });

    it('is blank, never age_y, when birth_date is null', () => {
      const counters = newProjectCounters();
      const row = { ...baseRow({ onset_date: '2025-06-15' }), age_y: 25 };
      delete (row as Record<string, unknown>).birth_date;
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.onset_age).toBe('');
      expect(counters.impossibleDerivationInputs).toBe(0);
    });

    it('is blank and uncounted for a malformed date, not impossible', () => {
      const counters = newProjectCounters();
      const row = baseRow({ birth_date: 'not-a-date' });
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.onset_age).toBe('');
      expect(counters.impossibleDerivationInputs).toBe(0);
    });

    it('is blank and counted when onset_date is before birth_date', () => {
      const counters = newProjectCounters();
      const row = baseRow({
        birth_date: '2025-06-20',
        onset_date: '2025-06-15',
      });
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.onset_age).toBe('');
      expect(counters.impossibleDerivationInputs).toBe(1);
    });

    it('is blank and counted for a future birth_date', () => {
      const counters = newProjectCounters();
      const row = baseRow({
        birth_date: '2026-06-20',
        onset_date: '2026-06-15',
      });
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.onset_age).toBe('');
      expect(counters.impossibleDerivationInputs).toBe(1);
    });

    it('is blank and counted for an age over 120', () => {
      const counters = newProjectCounters();
      const row = baseRow({
        birth_date: '1900-01-01',
        onset_date: '2025-06-15',
      });
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.onset_age).toBe('');
      expect(counters.impossibleDerivationInputs).toBe(1);
    });

    it('never falls back to age_y even when it is populated', () => {
      const counters = newProjectCounters();
      const row = { ...baseRow(), age_y: 999 };
      delete (row as Record<string, unknown>).birth_date;
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.onset_age).toBe('');
    });
  });

  describe('epidem_health_zone', () => {
    it('resolves through the province lookup', () => {
      const counters = newProjectCounters();
      const projected = projectRow(
        baseRow({ epidem_chw_code: 96 }),
        '201',
        PROVINCES,
        NOW,
        counters,
      );
      expect(projected.epidem_health_zone).toBe('13');
    });

    it('is blank, uncounted, when epidem_chw_code is null — a gap in the source', () => {
      const counters = newProjectCounters();
      const row = baseRow();
      delete (row as Record<string, unknown>).epidem_chw_code;
      const projected = projectRow(row, '201', PROVINCES, NOW, counters);
      expect(projected.epidem_health_zone).toBe('');
      expect(counters.impossibleDerivationInputs).toBe(0);
    });

    it('throws StaleProvinceTableError, not a blank, for a code outside the 77', () => {
      const counters = newProjectCounters();
      const row = baseRow({ epidem_chw_code: 50 });
      expect(() => projectRow(row, '201', PROVINCES, NOW, counters)).toThrow(
        StaleProvinceTableError,
      );
    });

    it('never quotes the code it did not recognise: it is a field of a row (§14.5)', () => {
      const counters = newProjectCounters();
      const row = baseRow({ epidem_chw_code: 57 });
      let message = '';
      try {
        projectRow(row, '201', PROVINCES, NOW, counters);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('57');
    });
  });

  describe('unknown field names', () => {
    it('never alerts on a known-kept or known-dropped field', () => {
      const counters = newProjectCounters();
      const row = { ...baseRow(), cid: 'encrypted', age_y: 25 };
      projectRow(row, '201', PROVINCES, NOW, counters);
      expect(counters.unknownFieldNames.size).toBe(0);
    });

    it('collects a field name nobody has catalogued, and never alerts on an absent one', () => {
      const counters = newProjectCounters();
      const row = baseRow({ a_brand_new_upstream_field: 'x' });
      projectRow(row, '201', PROVINCES, NOW, counters);
      expect([...counters.unknownFieldNames]).toEqual([
        'a_brand_new_upstream_field',
      ]);
    });

    it('every catalogued field is either kept or explained as dropped', () => {
      // Sanity on the catalogue itself: every allowlist column but the two
      // derived ones is a real, known upstream field.
      for (const column of PROJECT_COLUMNS) {
        if (column === 'onset_age' || column === 'epidem_health_zone') continue;
        expect(KNOWN_UPSTREAM_FIELDS.has(column)).toBe(true);
      }
    });
  });
});
