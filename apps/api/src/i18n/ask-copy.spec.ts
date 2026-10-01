import { describe, expect, it } from 'vitest';
import { REPO_ROOT, catalogue, projectLocales } from './copy-catalogue';
import { areaHeadline, formatDay } from './ask-copy';

describe('formatDay', () => {
  it('gives a Thai catalogue the Buddhist-era day the Requester screens show', () => {
    expect(formatDay('th', '2025-01-01')).toBe('1 มกราคม 2568');
  });

  it('gives an English catalogue the Gregorian day in English', () => {
    expect(formatDay('en', '2025-01-01')).toBe('1 January 2025');
  });

  it('reads the day as a calendar day, whatever the server timezone', () => {
    expect(formatDay('en', '2025-12-31')).toBe('31 December 2025');
  });

  it('has a day form for every locale the project declares', () => {
    for (const locale of projectLocales(REPO_ROOT).locales) {
      expect(() => formatDay(locale, '2025-01-01')).not.toThrow();
    }
  });

  it('refuses a locale it has no day form for, rather than guess one', () => {
    expect(() => formatDay('fr', '2025-01-01')).toThrow(/fr/);
  });
});

describe('areaHeadline', () => {
  const t = catalogue.t.bind(catalogue);

  it('names the whole country', () => {
    expect(areaHeadline(t, { kind: 'national' })).toBe(
      t('requester_area_national'),
    );
  });

  it('names a whole health region by its number', () => {
    expect(
      areaHeadline(t, {
        kind: 'provinces',
        provinces: [
          { id: '12', name: 'นนทบุรี' },
          { id: '13', name: 'ปทุมธานี' },
        ],
        region: 4,
      }),
    ).toBe(t('requester_area_region_selected', { region: 4 }));
  });

  it('lists provinces that are not a whole region', () => {
    expect(
      areaHeadline(t, {
        kind: 'provinces',
        provinces: [
          { id: '19', name: 'สระบุรี' },
          { id: '20', name: 'ชลบุรี' },
        ],
        region: null,
      }),
    ).toBe('สระบุรี, ชลบุรี');
  });
});
