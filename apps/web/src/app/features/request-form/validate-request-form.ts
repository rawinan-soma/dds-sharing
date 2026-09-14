import * as m from '../../../paraglide/messages.js';
import type { Province } from '../../reference-data/provinces.js';
import { inclusiveDayCount } from './span-days.js';
import type { RequestFormState } from './request-form.model.js';

const MAX_SPAN_DAYS = 365;

export interface RequestFormFieldErrors {
  diseaseGroupId?: string;
  dateRange?: string;
  area?: string;
  contact?: string;
}

export type RequestFormValidation =
  { ok: true } | { ok: false; errors: RequestFormFieldErrors };

const CONTACT_FIELD_LABELS: Record<
  keyof RequestFormState['contact'],
  () => string
> = {
  name: m.requester_contact_name_label,
  surname: m.requester_contact_surname_label,
  tel: m.requester_contact_tel_label,
  email: m.requester_contact_email_label,
  workplace: m.requester_contact_workplace_label,
};

/**
 * All on submit, never as-you-type (spec §16.4) — this runs once, when the
 * Requester presses "Check the request", and every error is collected in
 * one pass. Mirrors apps/api's validate-submit-request.ts rules so the
 * inline message never disagrees with the server's re-check.
 */
export function validateRequestForm(
  state: RequestFormState,
  provinces: readonly Province[],
): RequestFormValidation {
  const errors: RequestFormFieldErrors = {};

  if (!state.diseaseGroupId) {
    errors.diseaseGroupId = m.requester_disease_group_error();
  }

  if (!state.from || !state.to) {
    errors.dateRange = m.requester_date_range_error();
  } else {
    const days = inclusiveDayCount(state.from, state.to);
    if (days < 1) {
      errors.dateRange = m.requester_date_range_error();
    } else if (days > MAX_SPAN_DAYS) {
      errors.dateRange = m.requester_date_range_span_error({ days });
    }
  }

  if (state.areaKind === 'province') {
    const known = provinces.some((p) => p.provinceId === state.provinceId);
    if (!known) errors.area = m.requester_area_error();
  } else if (state.areaKind === 'region') {
    if (!state.region || state.region < 1 || state.region > 13) {
      errors.area = m.requester_area_error();
    }
  }

  const missingFields = (
    Object.keys(CONTACT_FIELD_LABELS) as Array<
      keyof RequestFormState['contact']
    >
  ).filter((field) => state.contact[field].trim().length === 0);
  if (missingFields.length > 0) {
    errors.contact = m.requester_contact_required_error({
      fields: missingFields
        .map((field) => CONTACT_FIELD_LABELS[field]())
        .join(', '),
    });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
}
