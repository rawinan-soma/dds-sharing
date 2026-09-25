// Archive naming (spec §8.3): `dds-envocc-sharing-{YYYYMMDD}-{HHMMSS}.zip`,
// Asia/Bangkok, from the Request's submit moment. The CSV inside shares the
// stem with `.csv`. No reference number ever appears here (spec §8.4's
// no-marker rule) — that leaves the timestamp as the only thing that could
// collide two archives, which is why a Re-run carries a `-rN` suffix: without
// it, a second run over the same Request would produce different rows under
// the identical filename, silently replacing the first on the Requester's
// disk.

const STAMP_IN_BANGKOK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function bangkokStamp(submittedAt: Date): string {
  const parts = new Map<string, string>(
    STAMP_IN_BANGKOK.formatToParts(submittedAt).map((p) => [p.type, p.value]),
  );
  const get = (type: string): string => parts.get(type)!;
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

/** `runNumber` is 1 for the original run; a Re-run passes 2, 3, ... */
export function archiveStem(submittedAt: Date, runNumber: number): string {
  const suffix = runNumber > 1 ? `-r${runNumber}` : '';
  return `dds-envocc-sharing-${bangkokStamp(submittedAt)}${suffix}`;
}

export function archiveFilename(submittedAt: Date, runNumber: number): string {
  return `${archiveStem(submittedAt, runNumber)}.zip`;
}

export function extractFilename(submittedAt: Date, runNumber: number): string {
  return `${archiveStem(submittedAt, runNumber)}.csv`;
}
