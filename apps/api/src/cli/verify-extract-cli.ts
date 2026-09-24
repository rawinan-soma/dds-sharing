import { createHash } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { request, requestEvent } from '../db/schema';
import { type CliOutput } from './cli-io';
import { extractsIn, NotAnExtractError } from './extracts-in';

// Fingerprint verification (spec §8.4, ADR 0005): a file arrives — an Extract
// archive or a bare CSV — and the question is whether it was released from
// here. A command, not a written procedure: a procedure performed by hand is
// how a wrong answer gets made under pressure.

const USAGE = `Usage:
  verify-extract <file>
      Reports which Request released this Extract, or that nothing matched.
      Takes an Extract archive (.zip) or a bare CSV, whichever arrived.`;

// Printed on every run, match or not, so nobody has to remember either.
const HOW_TO_READ = [
  'How to read this:',
  '  - A match is strong evidence; a mismatch is nearly none. A CSV opened in',
  '    Excel and saved again will not match although its data is unchanged, so',
  '    NO MATCH does not mean "this did not come from us".',
  '  - The fingerprint attests content, never provenance. Two Requests asking',
  '    the same question of the same data release identical bytes, and every',
  '    empty Extract shares one fingerprint, so a match narrows to a set of',
  '    Requests, never to one.',
];

export interface Release {
  reference: string;
  completedAt: Date;
  archiveFilename: string;
  rowCount: number;
}

export interface VerifyExtractDeps {
  readFile(path: string): Promise<Buffer>;
  findReleases(csvSha256: string): Promise<Release[]>;
}

/** Every `job_completed` whose Extract fingerprint is this checksum. */
export async function findReleases(
  db: Db,
  csvSha256: string,
): Promise<Release[]> {
  const rows = await db
    .select({
      reference: request.reference,
      completedAt: requestEvent.occurredAt,
      archiveFilename: sql<string>`${requestEvent.payload}->>'archiveFilename'`,
      rowCount: sql<number>`(${requestEvent.payload}->>'rowCount')::int`,
    })
    .from(requestEvent)
    .innerJoin(request, eq(request.id, requestEvent.requestId))
    .where(
      and(
        eq(requestEvent.type, 'job_completed'),
        sql`${requestEvent.payload}->>'csvSha256' = ${csvSha256}`,
      ),
    )
    .orderBy(asc(requestEvent.occurredAt), asc(requestEvent.id));
  return rows;
}

const BANGKOK = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Bangkok',
  dateStyle: 'short',
  timeStyle: 'short',
});

export async function runVerifyExtractCli(
  argv: string[],
  io: CliOutput,
  deps: VerifyExtractDeps,
): Promise<number> {
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    io.err(USAGE);
    return 1;
  }
  const [path] = argv;

  let candidates;
  try {
    candidates = await extractsIn(await deps.readFile(path));
  } catch (error) {
    if (error instanceof NotAnExtractError) {
      io.err(`${path}: ${error.message}`);
      return 1;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === 'string') {
      io.err(`Cannot read ${path}: ${(error as Error).message}`);
      return 1;
    }
    throw error;
  }

  io.out(`File: ${path}`);
  for (const candidate of candidates) {
    const checksum = createHash('sha256').update(candidate.bytes).digest('hex');
    const releases = await deps.findReleases(checksum);
    io.out('');
    io.out(
      candidate.name === null
        ? 'Extract: the file itself, a bare CSV'
        : `Extract: ${candidate.name}, inside the archive`,
    );
    io.out(`SHA-256: ${checksum}`);
    if (releases.length === 0) {
      io.out('NO MATCH: no Extract with this fingerprint was released here.');
      continue;
    }
    io.out(
      `MATCH: released for ${releases.length} ${releases.length === 1 ? 'Request' : 'Requests'}:`,
    );
    for (const r of releases) {
      io.out(
        `  ${r.reference}  completed ${BANGKOK.format(r.completedAt)} (Bangkok)  ${r.archiveFilename}  ${r.rowCount} rows`,
      );
    }
  }
  io.out('');
  for (const line of HOW_TO_READ) io.out(line);
  return 0;
}
