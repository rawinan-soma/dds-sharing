import { describe, it, expect } from 'vitest';
import { validateRequestForm } from './validate-request-form.js';
import {
  emptyRequestFormState,
  type RequestFormState,
} from './request-form.model.js';
import type { Province } from '../../reference-data/provinces.js';

const PROVINCES: Province[] = [
  { provinceId: '10', nameTh: 'กรุงเทพมหานคร', healthRegion: 13 },
  { provinceId: '39', nameTh: 'หนองบัวลำภู', healthRegion: 8 },
];

function validState(
  overrides: Partial<RequestFormState> = {},
): RequestFormState {
  return {
    ...emptyRequestFormState(),
    diseaseGroupId: 'silicosis',
    from: '2026-01-01',
    to: '2026-01-31',
    contact: { name: 'a', surname: 'b', tel: 'c', email: 'd', workplace: 'e' },
    ...overrides,
  };
}

describe('validateRequestForm', () => {
  it('accepts a fully filled national request', () => {
    expect(validateRequestForm(validState(), PROVINCES).ok).toBe(true);
  });

  it('rejects a missing disease group', () => {
    const result = validateRequestForm(
      validState({ diseaseGroupId: null }),
      PROVINCES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected errors');
    expect(result.errors.diseaseGroupId).toBeTruthy();
  });

  it('rejects a missing or inverted date range', () => {
    expect(
      validateRequestForm(validState({ from: '', to: '' }), PROVINCES).ok,
    ).toBe(false);
    expect(
      validateRequestForm(
        validState({ from: '2026-02-01', to: '2026-01-01' }),
        PROVINCES,
      ).ok,
    ).toBe(false);
  });

  it('rejects a span over 365 days', () => {
    const result = validateRequestForm(
      validState({ from: '2026-01-01', to: '2027-06-01' }),
      PROVINCES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected errors');
    expect(result.errors.dateRange).toBeTruthy();
  });

  it('rejects a province selection with no province chosen', () => {
    const result = validateRequestForm(
      validState({ areaKind: 'province', provinceId: null }),
      PROVINCES,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a region selection with no region chosen', () => {
    const result = validateRequestForm(
      validState({ areaKind: 'region', region: null }),
      PROVINCES,
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a valid province or region selection', () => {
    expect(
      validateRequestForm(
        validState({ areaKind: 'province', provinceId: '10' }),
        PROVINCES,
      ).ok,
    ).toBe(true);
    expect(
      validateRequestForm(
        validState({ areaKind: 'region', region: 8 }),
        PROVINCES,
      ).ok,
    ).toBe(true);
  });

  it('names every empty contact field in one message', () => {
    const result = validateRequestForm(
      validState({
        contact: {
          name: 'a',
          surname: '',
          tel: '',
          email: 'd',
          workplace: 'e',
        },
      }),
      PROVINCES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected errors');
    expect(result.errors.contact).toBeTruthy();
  });

  it('does not reject an unusual but non-empty email or tel', () => {
    const result = validateRequestForm(
      validState({
        contact: {
          name: 'a',
          surname: 'b',
          tel: 'not-a-phone',
          email: 'not-an-email',
          workplace: 'e',
        },
      }),
      PROVINCES,
    );
    expect(result.ok).toBe(true);
  });
});
