// Synthetic upstream rows. STANDING CONSTRAINT: no real patient data ever seeds
// the fake upstream harness (spec §17.3). Every value here is generated, and
// every string carries the word SYNTHETIC so a real value can never pass for one.
//
// The shape mimics what the real endpoint returns — including the plaintext
// identifiers that transit the client on every Request — so the log-discipline
// specs have something worth leaking.

const FIRST_DAY_MS = Date.parse('2025-01-01T00:00:00Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const DAYS_IN_CYCLE = 365;

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Row `index` of a code has its onset on day `index % 365` of 2025. */
export function onsetDayMs(index: number): number {
  return FIRST_DAY_MS + (index % DAYS_IN_CYCLE) * ONE_DAY_MS;
}

export function syntheticRow(
  groupCode: string,
  index: number,
  sentinel: string,
): Record<string, string> {
  const mark = (name: string) =>
    `SYNTHETIC-${name}-${groupCode}-${index}${sentinel ? `-${sentinel}` : ''}`;
  const onset = isoDay(onsetDayMs(index));
  return {
    epidem_report_guid: mark('guid'),
    epidem_report_group_code: groupCode,
    diagnosis_icd10: mark('icd10'),
    diagnosis_icd10_list: mark('icd10-list'),
    // Direct identifiers, deliberately present: the client must never log them.
    cid: mark('cid'),
    first_name: mark('first-name'),
    last_name: mark('last-name'),
    mobile_phone: mark('phone'),
    passport_no: mark('passport'),
    lab_report_result: mark('lab-result'),
    birth_date: mark('birth-date'),
    gender: mark('gender'),
    prefix: mark('prefix'),
    nationality: mark('nationality'),
    occupation: mark('occupation'),
    chw_code: mark('chw'),
    amp_code: mark('amp'),
    epidem_chw_code: mark('epidem-chw'),
    epidem_amp_code: mark('epidem-amp'),
    hospital_code: mark('hospital'),
    onset_date: onset,
    treated_date: onset,
    diagnosis_date: onset,
    report_datetime: `${onset}T00:00:00`,
    update_datetime: `${onset}T00:00:00`,
  };
}
