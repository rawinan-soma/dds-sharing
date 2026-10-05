// Small formatting for the two server-rendered pages (spec §9.1, §9.4). The
// catalogue's `{time}`/`{used}`/`{cap}` placeholders take already-formatted
// text, so this stays a plain formatter rather than a second translation
// layer. Units are the same in both languages except the hour, which is worded
// per the catalogue's locale.

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

/** Rounded down to the hour — never rounds a negative time-left up to "0 hours left" reading as still live. */
export function formatHoursLeft(ms: number, locale = 'en'): string {
  const hours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
  if (locale === 'th') return `${hours} ชั่วโมง`;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
