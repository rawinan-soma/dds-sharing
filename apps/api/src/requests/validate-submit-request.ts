import type { DiseaseGroup } from "../reference-data/disease-groups.js";
import type { ProvinceRow } from "../reference-data/province-integrity.js";
import { validateSpan } from "./span.js";
import type {
  ContactFields,
  NormalizedArea,
  SubmitRequestInput,
  ValidationError,
  ValidationResult,
} from "./submit-request.types.js";

const CONTACT_FIELDS = [
  "name",
  "surname",
  "tel",
  "email",
  "workplace",
] as const;
const MIN_REGION = 1;
const MAX_REGION = 13;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// A malformed date (wrong shape, or a shape-matching but non-existent
// calendar date like 2026-02-30) must be caught here as `date_range_invalid`
// — never handed to validateSpan, whose day-count arithmetic would silently
// produce NaN, which is neither `< 1` nor `> 365` and so would mislabel
// garbage input as a span-cap violation instead of an invalid range.
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validateDiseaseGroup(
  diseaseGroupId: string,
  groups: readonly DiseaseGroup[],
): { errors: ValidationError[]; group: DiseaseGroup | null } {
  if (!isNonEmptyString(diseaseGroupId)) {
    return {
      errors: [
        {
          field: "diseaseGroupId",
          code: "disease_group_required",
          message: "A Disease group is required.",
        },
      ],
      group: null,
    };
  }
  const group = groups.find((g) => g.id === diseaseGroupId);
  if (!group) {
    return {
      errors: [
        {
          field: "diseaseGroupId",
          code: "disease_group_unknown",
          message: "Unknown Disease group.",
        },
      ],
      group: null,
    };
  }
  return { errors: [], group };
}

function validateDateRange(
  from: string,
  to: string,
): { errors: ValidationError[]; days: number } {
  if (!isNonEmptyString(from) || !isNonEmptyString(to)) {
    return {
      errors: [
        {
          field: "dateRange",
          code: "date_range_required",
          message: "A date range is required.",
        },
      ],
      days: 0,
    };
  }

  if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
    return {
      errors: [
        {
          field: "dateRange",
          code: "date_range_invalid",
          message: "The date range is not a valid YYYY-MM-DD range.",
        },
      ],
      days: 0,
    };
  }

  const span = validateSpan(from, to);
  if (span.days < 1) {
    return {
      errors: [
        {
          field: "dateRange",
          code: "date_range_invalid",
          message: "The date range is inverted.",
        },
      ],
      days: span.days,
    };
  }
  if (!span.ok) {
    return {
      errors: [
        {
          field: "dateRange",
          code: "span_exceeds_cap",
          // Names the cap as upstream's (spec §4.2) — this is upstream's own
          // error text (§4.2), not this service's wording.
          message:
            "Date range must not exceed 1 year (365 days) — the DDC API caps it, this service does not.",
          details: { days: span.days },
        },
      ],
      days: span.days,
    };
  }

  return { errors: [], days: span.days };
}

function validateArea(
  area: SubmitRequestInput["area"],
  provinces: readonly ProvinceRow[],
): { errors: ValidationError[]; value: NormalizedArea } {
  if (!area || area.kind === "national") {
    return { errors: [], value: { kind: "national" } };
  }

  if (area.kind === "province") {
    const province = provinces.find((p) => p.provinceId === area.provinceId);
    if (!province) {
      return {
        errors: [
          { field: "area", code: "area_invalid", message: "Unknown province." },
        ],
        value: { kind: "national" },
      };
    }
    return {
      errors: [],
      value: {
        kind: "province",
        provinceId: province.provinceId,
        nameTh: province.nameTh,
      },
    };
  }

  if (area.kind === "region") {
    if (
      !Number.isInteger(area.region) ||
      area.region < MIN_REGION ||
      area.region > MAX_REGION
    ) {
      return {
        errors: [
          {
            field: "area",
            code: "area_invalid",
            message: "A health region must be 1-13.",
          },
        ],
        value: { kind: "national" },
      };
    }
    const regionProvinces = provinces
      .filter((p) => p.healthRegion === area.region)
      .sort((a, b) => a.provinceId.localeCompare(b.provinceId));
    return {
      errors: [],
      value: {
        kind: "region",
        region: area.region,
        provinces: regionProvinces,
      },
    };
  }

  return {
    errors: [
      {
        field: "area",
        code: "area_invalid",
        message: "Unrecognised area selection.",
      },
    ],
    value: { kind: "national" },
  };
}

function validateContact(contact: ContactFields): {
  errors: ValidationError[];
  value: ContactFields;
} {
  const trimmed = {
    name: (contact?.name ?? "").trim(),
    surname: (contact?.surname ?? "").trim(),
    tel: (contact?.tel ?? "").trim(),
    email: (contact?.email ?? "").trim(),
    workplace: (contact?.workplace ?? "").trim(),
  };

  const missingFields = CONTACT_FIELDS.filter(
    (field) => trimmed[field].length === 0,
  );
  if (missingFields.length > 0) {
    return {
      errors: [
        {
          field: "contact",
          code: "contact_field_required",
          message: `The following are required: ${missingFields.join(", ")}.`,
          details: { missingFields },
        },
      ],
      value: trimmed,
    };
  }

  return { errors: [], value: trimmed };
}

/**
 * Validates and normalizes a submit — all on submit, never as-you-type
 * (spec §16.4), and every error is collected in one pass so a Requester
 * gets one round trip. Never format-validates the contact fields (§4.7):
 * presence is the only rule.
 */
export function validateSubmitRequest(
  input: SubmitRequestInput,
  groups: readonly DiseaseGroup[],
  provinces: readonly ProvinceRow[],
): ValidationResult {
  const errors: ValidationError[] = [];

  const { errors: groupErrors, group } = validateDiseaseGroup(
    input.diseaseGroupId,
    groups,
  );
  errors.push(...groupErrors);

  const { errors: dateErrors, days } = validateDateRange(input.from, input.to);
  errors.push(...dateErrors);

  const { errors: areaErrors, value: area } = validateArea(
    input.area,
    provinces,
  );
  errors.push(...areaErrors);

  const { errors: contactErrors, value: contact } = validateContact(
    input.contact,
  );
  errors.push(...contactErrors);

  if (errors.length > 0 || !group) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      diseaseGroupId: group.id,
      diseaseGroupNameTh: group.nameTh,
      reportCodes: [...group.reportCodes],
      from: input.from,
      to: input.to,
      days,
      area,
      contact,
    },
  };
}
