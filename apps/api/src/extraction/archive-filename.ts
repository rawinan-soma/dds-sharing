const BANGKOK_TIME_ZONE = "Asia/Bangkok";

function bangkokDateTimeParts(instant: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const byType = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute,
    second: byType.second,
  };
}

export interface ExtractArchiveNames {
  archiveFilename: string;
  csvFilename: string;
}

/**
 * spec §8.3: the archive stem is `dds-envocc-sharing-{YYYYMMDD}-{HHMMSS}`
 * from the Request's **submit** moment in Asia/Bangkok — never the job's
 * own completion time, and never the host's local time zone. The CSV
 * shares the stem with a `.csv` extension. The filename holds no reference
 * number (§8.3's no-marker rule).
 *
 * `runNumber` is always 1 for the extraction this ticket produces. A
 * Re-run (FR-26, ticket #74) is the only thing that will ever call this
 * with 2 or higher — without the suffix, a Re-run would silently replace
 * the first archive on the Requester's disk under the same filename.
 */
export function buildArchiveNames(submittedAt: Date, runNumber: number): ExtractArchiveNames {
  if (!Number.isInteger(runNumber) || runNumber < 1) {
    throw new Error(`runNumber must be a positive integer, got ${runNumber}`);
  }

  const { year, month, day, hour, minute, second } = bangkokDateTimeParts(submittedAt);
  const suffix = runNumber > 1 ? `-r${runNumber}` : "";
  const stem = `dds-envocc-sharing-${year}${month}${day}-${hour}${minute}${second}${suffix}`;

  return { archiveFilename: `${stem}.zip`, csvFilename: `${stem}.csv` };
}
