const ICT_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `YYYY-MM-DD HH:mm ICT` — via `Intl`, not manual offset arithmetic: the
 * span builder is the only file allowed day arithmetic (§17.1's tripwire),
 * and this is display formatting, not a Request span. */
export function formatIct(date: Date): string {
  const parts = ICT_FORMAT.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ICT`;
}
