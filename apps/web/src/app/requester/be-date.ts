// The one place a date is typed and read in the Buddhist era
// (docs/design/system.md "Date field"). It stores ISO (Gregorian): the span,
// the 365-day cap and the Span builder never see a Buddhist year. Month names
// come from the platform's Thai calendar data, not the copy catalogue, as
// `formatDay` does for the check page and the popover's day labels.

const BUDDHIST_OFFSET = 543;
/** A year below this is read as the Common Era and shown back in พ.ศ. */
const FIRST_BUDDHIST_YEAR = 2400;

const monthNames = (month: 'short' | 'long') => {
  const format = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    month,
    timeZone: 'UTC',
  });
  return Array.from({ length: 12 }, (_, i) =>
    format.format(new Date(Date.UTC(2000, i, 1))),
  );
};

/** มกราคม … ธันวาคม, for the calendar's month select. */
export const MONTHS_LONG = monthNames('long');
const MONTHS_SHORT = monthNames('short');

const SHORT_DAY = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const NUMERIC = /^(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})$/;
const NAMED = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/;

function monthNumber(name: string): number | null {
  const short = MONTHS_SHORT.indexOf(name);
  if (short >= 0) return short + 1;
  const long = MONTHS_LONG.indexOf(name);
  return long >= 0 ? long + 1 : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A Gregorian year for a typed one: 2569 is พ.ศ., 2026 is ค.ศ. */
export const gregorianYear = (year: number) =>
  year < FIRST_BUDDHIST_YEAR ? year : year - BUDDHIST_OFFSET;

export const buddhistYear = (gregorian: number) => gregorian + BUDDHIST_OFFSET;

/** `1/3/2569`, `01-03-2569` or `1 มี.ค. 2569` as `2026-03-01`; null if it is not a day. */
export function parseBeDate(text: string): string | null {
  const typed = text.trim();
  let day: number;
  let month: number | null;
  let year: number;

  const numeric = NUMERIC.exec(typed);
  const named = numeric ? null : NAMED.exec(typed);
  if (numeric) {
    [day, month, year] = numeric.slice(1).map(Number);
  } else if (named) {
    day = Number(named[1]);
    month = monthNumber(named[2]);
    year = Number(named[3]);
  } else {
    return null;
  }
  if (month === null || month < 1 || month > 12 || day < 1) return null;

  const iso = `${gregorianYear(year)}-${pad(month)}-${pad(day)}`;
  // A day past the month's end rolls over, so it no longer reads back the same.
  const onCalendar = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(onCalendar.valueOf()) &&
    onCalendar.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

/** `2026-03-01` as `1 มี.ค. 2569`, the same form as the check page. */
export function formatBeDate(iso: string): string {
  return SHORT_DAY.format(new Date(`${iso}T00:00:00Z`));
}
