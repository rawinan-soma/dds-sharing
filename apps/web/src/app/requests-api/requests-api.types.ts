export interface ContactFields {
  name: string;
  surname: string;
  tel: string;
  email: string;
  workplace: string;
}

export type AreaSelectionInput =
  | { kind: 'national' }
  | { kind: 'province'; provinceId: string }
  | { kind: 'region'; region: number };

export interface SubmitRequestBody {
  diseaseGroupId: string;
  from: string;
  to: string;
  area: AreaSelectionInput;
  contact: ContactFields;
}

export type NormalizedArea =
  | { kind: 'national' }
  | { kind: 'province'; provinceId: string; nameTh: string }
  | {
      kind: 'region';
      region: number;
      provinces: { provinceId: string; nameTh: string; healthRegion: number }[];
    };

export interface SubmitRequestResponse {
  referenceNumber: string;
  diseaseGroupNameTh: string;
  from: string;
  to: string;
  days: number;
  area: NormalizedArea;
  servicePromiseBusinessHours: number;
}

export interface ValidationErrorItem {
  field: 'diseaseGroupId' | 'dateRange' | 'area' | 'contact';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DuplicateRequestResponse {
  code: 'request_in_progress';
  existingReferenceNumber: string;
  existingState: string;
  existingSubmittedAt: string;
}
