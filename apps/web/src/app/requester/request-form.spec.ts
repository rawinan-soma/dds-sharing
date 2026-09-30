import { describe, expect, it } from 'vitest';
import {
  emptyForm,
  meterOf,
  problemsOf,
  requirementsOf,
  regionProvinces,
  submissionBody,
  type FormState,
  type Province,
} from './request-form';

const provinces: Province[] = [
  { provinceId: '10', nameTh: 'กรุงเทพมหานคร', healthRegion: 13 },
  { provinceId: '57', nameTh: 'เชียงราย', healthRegion: 1 },
  { provinceId: '50', nameTh: 'เชียงใหม่', healthRegion: 1 },
];

const complete: FormState = {
  ...emptyForm(),
  diseaseGroupId: 'silicosis',
  from: '2025-01-01',
  to: '2025-01-31',
  name: 'Somchai',
  surname: 'Jaidee',
  tel: '081',
  email: 'a@b.c',
  workplace: 'Regional Office 1',
};

describe('problemsOf', () => {
  it('finds nothing wrong with a complete form', () => {
    expect(problemsOf(complete)).toEqual({
      missing: [],
      spanTooLong: false,
      reversed: false,
    });
  });

  it('names every empty field, in page order, when nothing is filled in', () => {
    expect(problemsOf(emptyForm()).missing).toEqual([
      'diseaseGroupId',
      'from',
      'to',
      'name',
      'surname',
      'workplace',
      'tel',
      'email',
    ]);
  });

  it('treats whitespace as empty', () => {
    expect(problemsOf({ ...complete, workplace: '   ' }).missing).toEqual([
      'workplace',
    ]);
  });

  it('flags a span over 365 days as its own problem, not as a missing field', () => {
    expect(problemsOf({ ...complete, to: '2026-01-02' })).toEqual({
      missing: [],
      spanTooLong: true,
      reversed: false,
    });
  });

  it('flags a `to` before `from`, so the check page is never reached with it', () => {
    expect(
      problemsOf({ ...complete, from: '2025-02-01', to: '2025-01-01' }),
    ).toEqual({ missing: [], spanTooLong: false, reversed: true });
  });

  it('needs a province when the area is one province, and a region when it is a region', () => {
    expect(problemsOf({ ...complete, areaMode: 'province' }).missing).toEqual([
      'area',
    ]);
    expect(problemsOf({ ...complete, areaMode: 'region' }).missing).toEqual([
      'area',
    ]);
    expect(
      problemsOf({ ...complete, areaMode: 'province', provinceId: '50' })
        .missing,
    ).toEqual([]);
    expect(
      problemsOf({ ...complete, areaMode: 'region', region: 1 }).missing,
    ).toEqual([]);
  });
});

describe('requirementsOf', () => {
  const states = (form: FormState, unreadable = false) =>
    requirementsOf(problemsOf(form), unreadable).map((r) => r.state);

  it('meets all five requirements on a complete form', () => {
    expect(states(complete)).toEqual(['met', 'met', 'met', 'met', 'met']);
  });

  it("holds the five rules in the Requester's order: group, dates, area, who, contact", () => {
    expect(
      requirementsOf(problemsOf(complete), false).map((r) => r.key),
    ).toEqual(['group', 'dates', 'area', 'identity', 'contact']);
  });

  it('counts an empty form as the whole country and nothing else', () => {
    expect(states(emptyForm())).toEqual([
      'unmet',
      'unmet',
      'met',
      'unmet',
      'unmet',
    ]);
  });

  it('breaks the date rule, not just leaves it unmet, when the range is wrong or unreadable', () => {
    expect(states({ ...complete, to: '2026-01-02' })[1]).toBe('broken');
    expect(
      states({ ...complete, from: '2025-02-01', to: '2025-01-01' })[1],
    ).toBe('broken');
    expect(states({ ...complete, to: '' }, true)[1]).toBe('broken');
  });

  it('names the fields to jump to for an unmet rule, first one first', () => {
    const identity = requirementsOf(
      problemsOf({ ...complete, surname: '', workplace: '' }),
      false,
    )[3];
    expect(identity.fields).toEqual(['surname', 'workplace']);
  });
});

describe('meterOf', () => {
  it('lights nothing at none met, one failed segment at 1–2, two pending at 3–4, all success at 5', () => {
    expect(meterOf(0)).toEqual({ lit: 0, tone: null });
    expect(meterOf(1)).toEqual({ lit: 1, tone: 'failed' });
    expect(meterOf(2)).toEqual({ lit: 1, tone: 'failed' });
    expect(meterOf(3)).toEqual({ lit: 2, tone: 'pending' });
    expect(meterOf(4)).toEqual({ lit: 2, tone: 'pending' });
    expect(meterOf(5)).toEqual({ lit: 3, tone: 'success' });
  });
});

describe('submissionBody', () => {
  it('sends national as no area at all', () => {
    expect(submissionBody(complete)).toEqual({
      diseaseGroupId: 'silicosis',
      from: '2025-01-01',
      to: '2025-01-31',
      contact: {
        name: 'Somchai',
        surname: 'Jaidee',
        tel: '081',
        email: 'a@b.c',
        workplace: 'Regional Office 1',
      },
    });
  });

  it('sends one province, or one region, never both', () => {
    expect(
      submissionBody({
        ...complete,
        areaMode: 'province',
        provinceId: '50',
        region: 1,
      }).area,
    ).toEqual({ provinceId: '50' });
    expect(
      submissionBody({
        ...complete,
        areaMode: 'region',
        provinceId: '50',
        region: 1,
      }).area,
    ).toEqual({ region: 1 });
  });
});

describe('regionProvinces', () => {
  it('lists the provinces a region expands to, in code order', () => {
    expect(regionProvinces(1, provinces).map((p) => p.provinceId)).toEqual([
      '50',
      '57',
    ]);
  });

  it('lists none for a region that is not chosen', () => {
    expect(regionProvinces(null, provinces)).toEqual([]);
  });
});
