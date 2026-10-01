import { type Area } from '../reference/area';
import { type Catalogue } from './copy-catalogue';

// How the API words an ask: its days and its Area selection, in the
// catalogue's language. Mirrors apps/web's requester/format-day.ts and
// reviewer/area-copy.ts rather than sharing them: the two apps have no common
// package, and the web copies read Paraglide where this reads the JSON
// catalogue (ADR 0010). The area wording is the same; the day is not quite —
// the web shows Buddhist-era Thai in every locale, while an email's day
// follows the email's language.

// One form per catalogue locale (project.inlang/settings.json; ask-copy.spec.ts
// fails when a locale is added there without one here). Thai readers
// get the Buddhist era the Requester screens use; English readers get the
// Gregorian day, so a date never reads in a different language from its label.
const DAY_FORMATS: Record<string, Intl.DateTimeFormat> = {
  th: new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  en: new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }),
};

/** A stored `YYYY-MM-DD` day, read as a calendar day (UTC), for `locale`'s readers. */
export function formatDay(locale: string, day: string): string {
  const format = DAY_FORMATS[locale];
  if (!format) {
    throw new Error(`ask copy: no day form for locale "${locale}"`);
  }
  return format.format(new Date(`${day}T00:00:00Z`));
}

/** The area in the Requester's own terms: the whole country, a region, or provinces. */
export function areaHeadline(t: Catalogue['t'], area: Area): string {
  if (area.kind === 'national') return t('requester_area_national');
  return area.region === null
    ? area.provinces.map((p) => p.name).join(', ')
    : t('requester_area_region_selected', { region: area.region });
}
