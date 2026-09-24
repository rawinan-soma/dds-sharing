/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   rows from pg are untyped by nature; the assertions are the types. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAIL_KINDS } from '../src/audit/event-catalogue';
import { type CliOutput } from '../src/cli/cli-io';
import {
  findReleases,
  runVerifyExtractCli,
} from '../src/cli/verify-extract-cli';
import {
  countUpstreamTraffic,
  runTrafficReportCli,
} from '../src/cli/traffic-report-cli';
import { buildArchive } from '../src/extraction/extract-archive';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

function fakeIo() {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliOutput = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { io, out, err, text: () => out.join('\n') };
}

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

describe('the host report commands', () => {
  let scratch: ScratchDatabase;
  let pool: Pool;

  let n = 0;
  async function insertRequest(state = 'approved'): Promise<string> {
    n += 1;
    const { rows } = await scratch.owner.query(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, $2, now(), 'silicosis', 'silicosis',
               '2025-01-01', '2025-01-31', '{999}', '{}')
       RETURNING id`,
      [`REQ-2569-${String(n).padStart(4, '0')}`, state],
    );
    return rows[0].id as string;
  }
  async function insertEvent(
    requestId: string,
    type: string,
    occurredAt: string,
    payload: object,
  ): Promise<void> {
    await scratch.owner.query(
      `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
       VALUES ($1, $2, 'system', $3, $4)`,
      [requestId, type, occurredAt, JSON.stringify(payload)],
    );
  }
  const completed = (csvSha256: string, archiveFilename: string) => ({
    rowCount: 1,
    columnCount: 2,
    csvBytes: 12,
    zipBytes: 300,
    csvSha256,
    provincesChecksum: 'p',
    dataDictionaryChecksum: 'd',
    archiveFilename,
    impossibleDerivationInputs: 0,
  });

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = new Pool({ connectionString: scratch.appUrl });
    pool.on('error', () => {});
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
  });

  describe('verify-extract', () => {
    const extract = Buffer.from('﻿a,b\r\n1,2\r\n', 'utf-8');
    const empty = Buffer.from('﻿a,b\r\n', 'utf-8');
    const files = new Map<string, Buffer>();
    const deps = () => ({
      readFile: (path: string) => {
        const file = files.get(path);
        return file
          ? Promise.resolve(file)
          : Promise.reject(
              Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' }),
            );
      },
      findReleases: (sha: string) => findReleases(drizzle(pool), sha),
    });

    beforeAll(async () => {
      const one = await insertRequest();
      await insertEvent(
        one,
        'job_completed',
        '2026-03-02T03:04:05Z',
        completed(sha256(extract), 'dds-envocc-sharing-20260302-100000.zip'),
      );
      // Two Requests that released the same (empty) bytes.
      for (const at of ['2026-03-03T01:00:00Z', '2026-03-04T01:00:00Z']) {
        const id = await insertRequest();
        await insertEvent(
          id,
          'job_completed',
          at,
          completed(sha256(empty), 'x.zip'),
        );
      }
      files.set('bare.csv', extract);
      files.set(
        'archive.zip',
        await buildArchive({ fileName: 'renamed.csv', bytes: extract }),
      );
      files.set('empty.csv', empty);
      // Opened in Excel and saved again: same data, different bytes.
      files.set('resaved.csv', Buffer.from('a,b\n1,2\n', 'utf-8'));
    });

    // Wrapped for a terminal, so read as prose.
    const caveats = (wrapped: string) => {
      const text = wrapped.replace(/\s+/g, ' ');
      expect(text).toMatch(
        /a match is strong evidence; a mismatch is nearly none/i,
      );
      expect(text).toMatch(/excel/i);
      expect(text).toMatch(/content, never provenance/i);
      expect(text).toMatch(/set of Requests, never to one/i);
    };

    it('reports the Request a bare CSV came from, with both caveats', async () => {
      const cli = fakeIo();
      expect(await runVerifyExtractCli(['bare.csv'], cli.io, deps())).toBe(0);
      const text = cli.text();
      expect(text).toContain(sha256(extract));
      expect(text).toMatch(/MATCH/);
      expect(text).toContain('REQ-2569-0001');
      expect(text).toContain('dds-envocc-sharing-20260302-100000.zip');
      // Completion time in Bangkok.
      expect(text).toContain('2026-03-02 10:04');
      caveats(text);
    });

    it('takes the Extract out of an Extract archive', async () => {
      const cli = fakeIo();
      expect(await runVerifyExtractCli(['archive.zip'], cli.io, deps())).toBe(
        0,
      );
      expect(cli.text()).toContain('renamed.csv');
      expect(cli.text()).toContain('REQ-2569-0001');
      caveats(cli.text());
    });

    it('lists every Request that released the same bytes', async () => {
      const cli = fakeIo();
      await runVerifyExtractCli(['empty.csv'], cli.io, deps());
      expect(cli.text()).toContain('REQ-2569-0002');
      expect(cli.text()).toContain('REQ-2569-0003');
      expect(cli.text()).toMatch(/2 Requests/);
      caveats(cli.text());
    });

    it('reports no match without saying the file is not ours, and prints the caveats too', async () => {
      const cli = fakeIo();
      expect(await runVerifyExtractCli(['resaved.csv'], cli.io, deps())).toBe(
        0,
      );
      const text = cli.text();
      expect(text).toMatch(/NO MATCH/);
      expect(text).not.toContain('REQ-');
      caveats(text);
    });

    it('reports a file it cannot read', async () => {
      const cli = fakeIo();
      expect(await runVerifyExtractCli(['missing.csv'], cli.io, deps())).toBe(
        1,
      );
      expect(cli.err.join('\n')).toMatch(/missing\.csv/);
      // Every run: an unreadable file is when the reminder matters most.
      caveats(cli.text());
    });

    it('needs exactly one file', async () => {
      const cli = fakeIo();
      expect(await runVerifyExtractCli([], cli.io, deps())).toBe(1);
      expect(cli.err.join('\n')).toMatch(/usage/i);
    });
  });

  describe('traffic-report', () => {
    const traffic = () => ({
      count: (range: { start: Date; end: Date }) =>
        countUpstreamTraffic(drizzle(pool), range),
    });

    beforeAll(async () => {
      const probe = (callsMade: number) => ({
        reportCodes: [],
        callsMade,
        spanStart: '2025-01-01',
        spanEnd: '2025-02-01',
        totalItemsByCode: {},
        totalItems: 0,
        xRequestIds: [],
      });
      const fetched = (pageCount: number) => ({
        groupCode: '999',
        startDate: '2025-01-01',
        endDate: '2025-02-01',
        pageCount,
        xRequestId: null,
        rowsReceived: 0,
        totalItems: 0,
      });
      // In range (Bangkok April 2026): a rejected and an expired Request
      // were still probed; an abandoned Probe spent three calls.
      const rejected = await insertRequest('rejected');
      await insertEvent(
        rejected,
        'probe_performed',
        '2026-04-01T02:00:00Z',
        probe(2),
      );
      const expired = await insertRequest('expired');
      await insertEvent(
        expired,
        'probe_performed',
        '2026-04-10T02:00:00Z',
        probe(1),
      );
      const abandoned = await insertRequest('pending');
      await insertEvent(abandoned, 'probe_failed', '2026-04-11T02:00:00Z', {
        groupCode: '999',
        errors: [
          { message: 'Upstream error (status 500)', xRequestId: 'a' },
          { message: 'Upstream error (status 500)', xRequestId: 'b' },
          { message: 'Upstream error (status 502)', xRequestId: null },
        ],
      });
      const approved = await insertRequest('approved');
      await insertEvent(
        approved,
        'probe_performed',
        '2026-04-12T02:00:00Z',
        probe(3),
      );
      await insertEvent(
        approved,
        'code_fetched',
        '2026-04-13T02:00:00Z',
        fetched(4),
      );
      await insertEvent(
        approved,
        'code_fetched',
        '2026-04-13T02:01:00Z',
        fetched(5),
      );
      // 2026-04-30 23:30 in Bangkok: still April.
      await insertEvent(
        approved,
        'code_fetched',
        '2026-04-30T16:30:00Z',
        fetched(1),
      );
      // Out of range: 2026-05-01 00:30 in Bangkok, and March.
      await insertEvent(
        approved,
        'code_fetched',
        '2026-04-30T17:30:00Z',
        fetched(100),
      );
      await insertEvent(
        rejected,
        'probe_performed',
        '2026-03-31T16:59:00Z',
        probe(100),
      );
    });

    it('counts upstream calls over the range, split by Probe and fetch', async () => {
      const cli = fakeIo();
      expect(
        await runTrafficReportCli(
          ['--from', '2026-04-01', '--to', '2026-04-30'],
          cli.io,
          traffic(),
        ),
      ).toBe(0);
      const text = cli.text();
      expect(text).toMatch(/Probe calls:\s+9\b/);
      expect(text).toMatch(/3 Probes performed, 6 calls/);
      expect(text).toMatch(/1 Probe abandoned, 3 calls/);
      expect(text).toMatch(/Fetch calls:\s+10\b/);
      expect(text).toMatch(/3 Report code fetches for 1 Request/);
      expect(text).toMatch(/Total upstream calls:\s+19\b/);
      expect(text).toMatch(/2026-04-01.*2026-04-30/);
    });

    it('reports zero for a quiet range', async () => {
      const cli = fakeIo();
      await runTrafficReportCli(
        ['--from', '2020-01-01', '--to', '2020-01-31'],
        cli.io,
        traffic(),
      );
      expect(cli.text()).toMatch(/Total upstream calls:\s+0\b/);
    });

    it.each([
      [['--from', '2026-04-01']],
      [['--from', '2026-04-31', '--to', '2026-05-01']],
      [['--from', '2026-04-02', '--to', '2026-04-01']],
      [['--from', '2026-04-01', '--to', '2026-04-30', '--operator', 'x']],
    ])('refuses %j', async (argv) => {
      const cli = fakeIo();
      expect(await runTrafficReportCli(argv, cli.io, traffic())).toBe(1);
      expect(cli.err.length).toBeGreaterThan(0);
    });
  });
});

// Not a dashboard and not an endpoint (§13.6), and no email reset path, ever
// (§17.5): nothing on the web surface reaches these acts.
describe('the host-only acts have no web path', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? sources(join(dir, e.name))
        : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')
          ? [join(dir, e.name)]
          : [],
    );
  const controllers = sources(join(__dirname, '../src')).filter((f) =>
    readFileSync(f, 'utf-8').includes('@Controller('),
  );

  it('finds the controllers', () => {
    expect(controllers.length).toBeGreaterThan(3);
  });

  it.each(controllers)('%s routes no traffic, fingerprint or reset', (file) => {
    const routes = [
      ...readFileSync(file, 'utf-8').matchAll(
        /@(?:Controller|Get|Post|Put|Patch|Delete|All)\(\s*['"`]([^'"`]*)/g,
      ),
    ].map((m) => m[1]);
    for (const route of routes) {
      expect(route).not.toMatch(
        /traffic|fingerprint|verify|reset|forgot|recover|enrol/i,
      );
    }
  });

  it('sends no reset mail', () => {
    for (const kind of MAIL_KINDS) {
      expect(kind).not.toMatch(/reset|password|enrol|recover/i);
    }
  });
});
