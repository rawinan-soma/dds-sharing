// Buddhist-era display for a `YYYY-MM-DD` day. Screen readers still get the
// Gregorian value through `<time datetime>`, so the display never has to be
// parsed back.
const BUDDHIST = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDay(day: string): string {
  return BUDDHIST.format(new Date(`${day}T00:00:00Z`));
}
