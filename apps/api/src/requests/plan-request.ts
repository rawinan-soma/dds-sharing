import { DISEASE_GROUPS } from '../reference/disease-groups';
import { type ProvinceRow } from '../reference/province-rows';
import { daysBetween, isCalendarDay } from '../upstream/span-builder';

// Turns what a Requester posted into what is stored (spec §4, §12.3): checks the
// three parameters and the five contact fields, and performs the two
// expansions — Disease group → Report codes, health region → provinces. The
// stored Request names codes and provinces, never a region, so a Re-run
// refetches what the first run fetched rather than what the names mean today.
//
// Pure: the province list comes in, nothing goes out. The 365-day cap is
// re-checked here as the guard against direct API calls; the picker is the
// first place it is enforced (§4.2).

/** Upstream's cap, and the wording that says so: the true answer to "why?". */
export const MAX_SPAN_DAYS = 365;
export const SPAN_TOO_LONG_MESSAGE =
  'The upstream DDC API limits one request to 365 days, so this date range cannot be accepted. It is not split for you: send more than one request.';

// A size guard on free text, not a format rule: nothing here is validated.
const MAX_FREE_TEXT_LENGTH = 500;

export const CONTACT_FIELDS = [
  'name',
  'surname',
  'tel',
  'email',
  'workplace',
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export type ContactDetails = Record<ContactField, string>;

export interface RequestPlan {
  diseaseGroupId: string;
  /** The human form of the ask: what the Requester chose. */
  diseaseGroupName: string;
  /** Inclusive, `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  /** The expansion, and the authority: what a Re-run refetches. */
  reportCodes: string[];
  /** The expansion of a region, or the one province. Empty is national. */
  provinces: string[];
  contact: ContactDetails;
}

export type PlanErrorCode =
  'required' | 'invalid' | 'span_too_long' | 'area_conflict';

export interface PlanError {
  field: string;
  code: PlanErrorCode;
  message: string;
}

export type PlanResult =
  { ok: true; plan: RequestPlan } | { ok: false; errors: PlanError[] };

interface Context {
  provinces: readonly ProvinceRow[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function planRequest(body: unknown, { provinces }: Context): PlanResult {
  const errors: PlanError[] = [];
  const fail = (field: string, code: PlanErrorCode, message: string) =>
    errors.push({ field, code, message });

  if (!isRecord(body)) {
    return {
      ok: false,
      errors: [
        { field: 'body', code: 'invalid', message: 'Expected a JSON object.' },
      ],
    };
  }

  // Disease group: one of the ten, by id, never a Report code.
  const group = DISEASE_GROUPS.find((g) => g.id === body.diseaseGroupId);
  if (body.diseaseGroupId === undefined || body.diseaseGroupId === '') {
    fail('diseaseGroupId', 'required', 'Choose a disease group.');
  } else if (!group) {
    fail('diseaseGroupId', 'invalid', 'Unknown disease group.');
  }

  // Date range.
  let datesValid = true;
  for (const field of ['from', 'to'] as const) {
    const value = body[field];
    if (value === undefined || value === null || value === '') {
      fail(field, 'required', 'Enter a date.');
      datesValid = false;
    } else if (!isCalendarDay(value)) {
      fail(field, 'invalid', 'Not a real calendar day (YYYY-MM-DD).');
      datesValid = false;
    }
  }
  if (datesValid) {
    const span = daysBetween(body.from as string, body.to as string);
    if (span < 0) {
      fail('to', 'invalid', 'The last day is before the first day.');
    } else if (span > MAX_SPAN_DAYS) {
      fail('to', 'span_too_long', SPAN_TOO_LONG_MESSAGE);
    }
  }

  // Area: national, or one province, or one region. Never a combination.
  let areaProvinces: string[] = [];
  if (body.area !== undefined && body.area !== null) {
    const area = isRecord(body.area) ? body.area : undefined;
    const hasProvince = area?.provinceId !== undefined;
    const hasRegion = area?.region !== undefined;
    if (!area) {
      fail('area', 'invalid', 'Malformed area selection.');
    } else if (hasProvince && hasRegion) {
      fail(
        'area',
        'area_conflict',
        'Choose one province or one health region, not both.',
      );
    } else if (hasProvince) {
      const match = provinces.find((p) => p.provinceId === area.provinceId);
      if (match) areaProvinces = [match.provinceId];
      else fail('area', 'invalid', 'Unknown province.');
    } else if (hasRegion) {
      areaProvinces = provinces
        .filter((p) => p.healthRegion === area.region)
        .map((p) => p.provinceId)
        .sort();
      if (areaProvinces.length === 0) {
        fail('area', 'invalid', 'Unknown health region.');
      }
    }
  }

  // Contact: free text, never validated for format, never verified.
  const rawContact = isRecord(body.contact) ? body.contact : {};
  const contact = {} as ContactDetails;
  for (const field of CONTACT_FIELDS) {
    const raw = rawContact[field];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      fail(field, 'required', 'Fill in this field.');
    } else if (value.length > MAX_FREE_TEXT_LENGTH) {
      fail(field, 'invalid', `At most ${MAX_FREE_TEXT_LENGTH} characters.`);
    } else {
      contact[field] = value;
    }
  }

  if (errors.length > 0 || !group) return { ok: false, errors };

  return {
    ok: true,
    plan: {
      diseaseGroupId: group.id,
      diseaseGroupName: group.name,
      startDate: body.from as string,
      endDate: body.to as string,
      reportCodes: [...group.reportCodes],
      provinces: areaProvinces,
      contact,
    },
  };
}
