import { describe, expect, it } from 'vitest';
import { DISEASE_GROUPS } from '../reference/disease-groups';
import { type ProvinceRow } from '../reference/province-rows';
import { planRequest, type PlanResult } from './plan-request';

const provinces: ProvinceRow[] = [
  { provinceId: '10', nameTh: 'กรุงเทพมหานคร', healthRegion: 13 },
  { provinceId: '50', nameTh: 'เชียงใหม่', healthRegion: 1 },
  { provinceId: '57', nameTh: 'เชียงราย', healthRegion: 1 },
  { provinceId: '58', nameTh: 'แม่ฮ่องสอน', healthRegion: 1 },
];

const contact = {
  name: 'Somchai',
  surname: 'Jaidee',
  tel: '081 234 5678',
  email: 'somchai@example.go.th',
  workplace: 'Regional Office 1',
};

const valid = {
  diseaseGroupId: 'silicosis',
  from: '2025-01-01',
  to: '2025-01-31',
  contact,
};

const plan = (body: unknown) => planRequest(body, { provinces });

function accepted(result: PlanResult) {
  if (!result.ok) {
    throw new Error(`expected a plan, got ${JSON.stringify(result.errors)}`);
  }
  return result.plan;
}

function refused(result: PlanResult) {
  if (result.ok) throw new Error('expected a refusal, got a plan');
  return result.errors;
}

describe('planRequest', () => {
  describe('the two expansions', () => {
    it('expands the Disease group to its Report codes and keeps the name as the human form', () => {
      const result = accepted(plan(valid));

      expect(result.diseaseGroupId).toBe('silicosis');
      expect(result.diseaseGroupName).toBe('โรคซิลิโคสิส');
      expect(result.reportCodes).toEqual(['202', '203']);
    });

    it('expands every group to the codes of docs/disease-groups.md', () => {
      for (const group of DISEASE_GROUPS) {
        const result = accepted(plan({ ...valid, diseaseGroupId: group.id }));
        expect(result.reportCodes).toEqual(group.reportCodes);
      }
    });

    it('expands a health region to its province list and stores no region', () => {
      const result = accepted(plan({ ...valid, area: { region: 1 } }));

      expect(result.provinces).toEqual(['50', '57', '58']);
      expect(result).not.toHaveProperty('region');
    });

    it('stores one province as exactly that province, not its region', () => {
      const result = accepted(plan({ ...valid, area: { provinceId: '50' } }));

      expect(result.provinces).toEqual(['50']);
    });

    it('treats an absent, null or empty area as national: no provinces', () => {
      for (const area of [undefined, null, {}]) {
        expect(accepted(plan({ ...valid, area })).provinces).toEqual([]);
      }
    });

    it('stores the inclusive dates exactly as the human gave them', () => {
      const result = accepted(plan(valid));

      expect(result.startDate).toBe('2025-01-01');
      expect(result.endDate).toBe('2025-01-31');
    });
  });

  describe('the 365-day cap', () => {
    it('accepts a span of exactly 365 days', () => {
      expect(plan({ ...valid, from: '2025-01-01', to: '2026-01-01' }).ok).toBe(
        true,
      );
    });

    it('refuses a span of 366 days, never splitting it, and names the cap as upstream’s', () => {
      const errors = refused(
        plan({ ...valid, from: '2025-01-01', to: '2026-01-02' }),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('span_too_long');
      expect(errors[0].message).toMatch(/upstream/i);
      expect(errors[0].message).toMatch(/365/);
    });

    it('counts a leap year by the calendar, not by 365 × n', () => {
      expect(plan({ ...valid, from: '2024-01-01', to: '2024-12-31' }).ok).toBe(
        true,
      );
      expect(plan({ ...valid, from: '2024-01-01', to: '2025-01-02' }).ok).toBe(
        false,
      );
    });

    it('accepts a single day', () => {
      expect(plan({ ...valid, from: '2025-03-05', to: '2025-03-05' }).ok).toBe(
        true,
      );
    });

    it('refuses a `to` before `from`', () => {
      const errors = refused(
        plan({ ...valid, from: '2025-03-05', to: '2025-03-04' }),
      );

      expect(errors.map((e) => e.field)).toEqual(['to']);
    });
  });

  describe('area selection', () => {
    it('refuses a province together with a region', () => {
      const errors = refused(
        plan({ ...valid, area: { provinceId: '50', region: 1 } }),
      );

      expect(errors.map((e) => e.code)).toEqual(['area_conflict']);
    });

    it('refuses a province that is not in the seeded list', () => {
      const errors = refused(plan({ ...valid, area: { provinceId: '99' } }));

      expect(errors.map((e) => e.field)).toEqual(['area']);
    });

    it('refuses a region with no provinces', () => {
      for (const region of [0, 14, 1.5, '1']) {
        expect(plan({ ...valid, area: { region } }).ok).toBe(false);
      }
    });
  });

  describe('the ask', () => {
    it('refuses a Disease group that is not one of the ten', () => {
      const errors = refused(plan({ ...valid, diseaseGroupId: 'nope' }));

      expect(errors.map((e) => e.field)).toEqual(['diseaseGroupId']);
    });

    it('refuses a raw Report code in place of a group', () => {
      expect(plan({ ...valid, diseaseGroupId: '202' }).ok).toBe(false);
    });

    it('refuses dates that are not real calendar days', () => {
      for (const from of ['2025-02-30', '01/01/2025', '', 20250101, null]) {
        expect(plan({ ...valid, from }).ok).toBe(false);
      }
    });

    it('reports every problem at once, so the form can list them all', () => {
      const errors = refused(plan({}));

      expect(errors.map((e) => e.field).sort()).toEqual(
        [
          'diseaseGroupId',
          'from',
          'to',
          'name',
          'surname',
          'tel',
          'email',
          'workplace',
        ].sort(),
      );
    });

    it('refuses a body that is not an object', () => {
      for (const body of [null, 'x', 7, []]) {
        expect(plan(body).ok).toBe(false);
      }
    });
  });

  describe('contact fields', () => {
    it('keeps free text as typed apart from surrounding whitespace, and validates no format', () => {
      const result = accepted(
        plan({
          ...valid,
          contact: {
            name: '  Somchai ',
            surname: 'J',
            tel: 'call me',
            email: 'not an email',
            workplace: 'my house',
          },
        }),
      );

      expect(result.contact).toEqual({
        name: 'Somchai',
        surname: 'J',
        tel: 'call me',
        email: 'not an email',
        workplace: 'my house',
      });
    });

    it('requires each of the five to be present', () => {
      for (const field of Object.keys(contact)) {
        const errors = refused(
          plan({ ...valid, contact: { ...contact, [field]: '   ' } }),
        );
        expect(errors.map((e) => e.field)).toEqual([field]);
      }
    });

    it('refuses text longer than 500 characters, as a size guard and not a format rule', () => {
      const errors = refused(
        plan({ ...valid, contact: { ...contact, workplace: 'x'.repeat(501) } }),
      );

      expect(errors.map((e) => e.field)).toEqual(['workplace']);
    });
  });
});
