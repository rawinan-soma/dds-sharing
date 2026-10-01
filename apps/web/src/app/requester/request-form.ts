import { dayCount, exceedsCap } from './span-cap';

// The form's state and the rules that read it, kept out of the component so they
// are testable without a DOM. Nothing here is validated for format: the contact
// fields are free text and only need to be present (spec §4.7).

export type AreaMode = 'national' | 'province' | 'region';

export interface Province {
  provinceId: string;
  nameTh: string;
  healthRegion: number;
}

export interface DiseaseGroupChoice {
  id: string;
  name: string;
}

export interface FormState {
  diseaseGroupId: string | null;
  from: string;
  to: string;
  areaMode: AreaMode;
  provinceId: string;
  region: number | null;
  name: string;
  surname: string;
  tel: string;
  email: string;
  workplace: string;
  /** The PDPA acknowledgement. Required to send, never posted. */
  consent: boolean;
}

export const emptyForm = (): FormState => ({
  diseaseGroupId: null,
  from: '',
  to: '',
  areaMode: 'national',
  provinceId: '',
  region: null,
  name: '',
  surname: '',
  tel: '',
  email: '',
  workplace: '',
  consent: false,
});

/** A field the requirement checklist can jump to, in form-card order. */
export type FieldKey =
  | 'diseaseGroupId'
  | 'from'
  | 'to'
  | 'area'
  | 'name'
  | 'surname'
  | 'workplace'
  | 'tel'
  | 'email';

export const CONTACT_KEYS = [
  'name',
  'surname',
  'workplace',
  'tel',
  'email',
] as const;

export interface Problems {
  missing: FieldKey[];
  /** Both dates are present and the range is over 365 days. */
  spanTooLong: boolean;
  /** Both dates are present and `to` is before `from`. */
  reversed: boolean;
}

export function problemsOf(form: FormState): Problems {
  const missing: FieldKey[] = [];
  if (!form.diseaseGroupId) missing.push('diseaseGroupId');
  if (!form.from) missing.push('from');
  if (!form.to) missing.push('to');
  if (form.areaMode === 'province' && !form.provinceId) missing.push('area');
  if (form.areaMode === 'region' && form.region === null) missing.push('area');
  for (const key of CONTACT_KEYS) {
    if (form[key].trim() === '') missing.push(key);
  }
  return {
    missing,
    spanTooLong: exceedsCap(form.from, form.to),
    reversed:
      Boolean(form.from && form.to) && dayCount(form.from, form.to) === null,
  };
}

export type RequirementKey =
  'group' | 'dates' | 'area' | 'identity' | 'contact';

/**
 * `unmet` is not done yet; `broken` is filled in but against a rule (a range
 * over the cap, backwards, or a date that does not read), shown as failed
 * before any attempt to send.
 */
export type RequirementState = 'met' | 'unmet' | 'broken';

export interface Requirement {
  key: RequirementKey;
  state: RequirementState;
  /** The fields to jump to, first one first; empty when met. */
  fields: FieldKey[];
}

const REQUIREMENT_FIELDS: Record<RequirementKey, FieldKey[]> = {
  group: ['diseaseGroupId'],
  dates: ['from', 'to'],
  area: ['area'],
  identity: ['name', 'surname', 'workplace'],
  contact: ['tel', 'email'],
};

/**
 * The form's rules in the Requester's words, the five items of the requirement
 * checklist (docs/design/system.md). `unreadableDate` is a date field holding
 * text that is not a day, which the form state cannot see: it stores ISO only.
 */
export function requirementsOf(
  problems: Problems,
  unreadableDate: boolean,
): Requirement[] {
  const missing = new Set(problems.missing);
  return (Object.keys(REQUIREMENT_FIELDS) as RequirementKey[]).map((key) => {
    const fields = REQUIREMENT_FIELDS[key].filter((f) => missing.has(f));
    const broken =
      key === 'dates' &&
      (problems.spanTooLong || problems.reversed || unreadableDate);
    return {
      key,
      state: broken ? 'broken' : fields.length > 0 ? 'unmet' : 'met',
      fields: broken && fields.length === 0 ? ['to'] : fields,
    };
  });
}

export interface Meter {
  lit: 0 | 1 | 2 | 3;
  tone: 'failed' | 'pending' | 'success' | null;
}

/** Three segments: none, one failed, two pending, three success. */
export function meterOf(met: number): Meter {
  if (met >= 5) return { lit: 3, tone: 'success' };
  if (met >= 3) return { lit: 2, tone: 'pending' };
  if (met >= 1) return { lit: 1, tone: 'failed' };
  return { lit: 0, tone: null };
}

export interface SubmissionBody {
  diseaseGroupId: string;
  from: string;
  to: string;
  area?: { provinceId: string } | { region: number };
  contact: Record<(typeof CONTACT_KEYS)[number], string>;
}

/** What is posted. Only the chosen area travels, so both can never be sent. */
export function submissionBody(form: FormState): SubmissionBody {
  const body: SubmissionBody = {
    diseaseGroupId: form.diseaseGroupId ?? '',
    from: form.from,
    to: form.to,
    contact: {
      name: form.name,
      surname: form.surname,
      tel: form.tel,
      email: form.email,
      workplace: form.workplace,
    },
  };
  if (form.areaMode === 'province') {
    body.area = { provinceId: form.provinceId };
  } else if (form.areaMode === 'region' && form.region !== null) {
    body.area = { region: form.region };
  }
  return body;
}

/** The provinces a health region expands to, shown before submit (§4.4). */
export function regionProvinces(
  region: number | null,
  provinces: readonly Province[],
): Province[] {
  if (region === null) return [];
  return provinces
    .filter((p) => p.healthRegion === region)
    .sort((a, b) => a.provinceId.localeCompare(b.provinceId));
}
