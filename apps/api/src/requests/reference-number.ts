// `REQ-2569-0142`: a display label, never a key (spec §12.5). The prefix is the
// service's own — `REQ` by default, `PLT` on the Pilot (ADR 0022) — so a number
// quoted over the telephone says which record to look in. The year is the
// Buddhist era, read in Bangkok so a submit just after midnight ICT on 1 January
// is in the new year whatever the server's clock says.
const YEAR_IN_BANGKOK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
});

export function formatReference(
  prefix: string,
  submittedAt: Date,
  counter: number,
): string {
  const buddhistYear = Number(YEAR_IN_BANGKOK.format(submittedAt)) + 543;
  return `${prefix}-${buddhistYear}-${String(counter).padStart(4, '0')}`;
}
