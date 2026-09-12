import type { ProvinceRow } from "../reference-data/province-integrity.js";

export interface ContactFields {
  name: string;
  surname: string;
  tel: string;
  email: string;
  workplace: string;
}

export type AreaSelectionInput =
  | { kind: "national" }
  | { kind: "province"; provinceId: string }
  | { kind: "region"; region: number };

export interface SubmitRequestInput {
  diseaseGroupId: string;
  from: string;
  to: string;
  area?: AreaSelectionInput;
  contact: ContactFields;
}

export type NormalizedArea =
  | { kind: "national" }
  | { kind: "province"; provinceId: string; nameTh: string }
  | { kind: "region"; region: number; provinces: ProvinceRow[] };

export interface NormalizedRequest {
  diseaseGroupId: string;
  diseaseGroupNameTh: string;
  reportCodes: string[];
  from: string;
  to: string;
  days: number;
  area: NormalizedArea;
  contact: ContactFields;
}

export interface ValidationError {
  field: "diseaseGroupId" | "dateRange" | "area" | "contact";
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ValidationResult =
  | { ok: true; value: NormalizedRequest }
  | { ok: false; errors: ValidationError[] };
