import type { ContactFields } from '../../requests-api/requests-api.types.js';

export type FormAreaKind = 'national' | 'province' | 'region';

export interface RequestFormState {
  diseaseGroupId: string | null;
  from: string;
  to: string;
  areaKind: FormAreaKind;
  provinceId: string | null;
  region: number | null;
  contact: ContactFields;
}

export function emptyRequestFormState(): RequestFormState {
  return {
    diseaseGroupId: null,
    from: '',
    to: '',
    areaKind: 'national',
    provinceId: null,
    region: null,
    contact: { name: '', surname: '', tel: '', email: '', workplace: '' },
  };
}
