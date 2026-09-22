import { describe, expect, it } from 'vitest';
import { filterRow, normalizeGeographyCode } from './filter';

describe('normalizeGeographyCode', () => {
  it('stringifies a JSON number, as upstream sends geography codes', () => {
    expect(normalizeGeographyCode(10)).toBe('10');
    expect(normalizeGeographyCode(96)).toBe('96');
  });

  it('treats null, undefined and empty string as absent', () => {
    expect(normalizeGeographyCode(null)).toBeNull();
    expect(normalizeGeographyCode(undefined)).toBeNull();
    expect(normalizeGeographyCode('')).toBeNull();
  });

  it('passes a non-empty string through unchanged', () => {
    expect(normalizeGeographyCode('10')).toBe('10');
  });
});

describe('filterRow', () => {
  it('keeps every row for a national Request (empty provinces), missing code or not', () => {
    expect(filterRow({ epidem_chw_code: 10 }, [])).toEqual({
      kept: true,
      epidemChwCodeMissing: false,
    });
    expect(filterRow({}, [])).toEqual({
      kept: true,
      epidemChwCodeMissing: true,
    });
  });

  it('matches epidem_chw_code by prefix against the stored province list', () => {
    expect(filterRow({ epidem_chw_code: 10 }, ['10', '11'])).toEqual({
      kept: true,
      epidemChwCodeMissing: false,
    });
    expect(filterRow({ epidem_chw_code: 12 }, ['10', '11'])).toEqual({
      kept: false,
      epidemChwCodeMissing: false,
    });
  });

  it('never matches on chw_code, even when epidem_chw_code disagrees', () => {
    // The registered-residence province matches, the survey-time one does
    // not: the row must be dropped (spec §4.4) — this is the exact failure
    // shape a filter written against the wrong column would miss.
    expect(filterRow({ chw_code: 10, epidem_chw_code: 99 }, ['10'])).toEqual({
      kept: false,
      epidemChwCodeMissing: false,
    });
  });

  it('drops a row with a missing epidem_chw_code from a provincial filter, and counts it', () => {
    expect(filterRow({}, ['10'])).toEqual({
      kept: false,
      epidemChwCodeMissing: true,
    });
  });

  it('normalises upstream JSON numbers to strings before comparing', () => {
    expect(filterRow({ epidem_chw_code: 10 }, ['10'])).toEqual({
      kept: true,
      epidemChwCodeMissing: false,
    });
  });
});
