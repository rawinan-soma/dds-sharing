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
});

/** A field the incomplete-submit summary can jump to, in page order. */
export type FieldKey =
  | 'diseaseGroupId'
  | 'from'
  | 'to'
  | 'area'
  | 'name'
  | 'surname'
  | 'tel'
  | 'email'
  | 'workplace';

export const CONTACT_KEYS = [
  'name',
  'surname',
  'tel',
  'email',
  'workplace',
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
