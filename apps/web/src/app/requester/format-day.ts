// Buddhist-era display for a `YYYY-MM-DD` day. Screen readers still get the
// Gregorian value through `<time datetime>`, so the display never has to be
// parsed back. Mirrored by apps/api/src/i18n/ask-copy.ts's formatDay for the
// emails, which picks the day form by the catalogue's locale.
const BUDDHIST = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDay(day: string): string {
  return BUDDHIST.format(new Date(`${day}T00:00:00Z`));
}
