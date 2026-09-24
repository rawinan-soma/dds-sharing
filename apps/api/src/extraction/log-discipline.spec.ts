import { inspect } from 'node:util';
import { type LoggerService } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeUpstream,
  type FakeUpstream,
} from '../../test/fake-upstream/fake-upstream';
import { UpstreamClient } from '../upstream/upstream-client';
import {
  ExtractionFailure,
  runExtraction,
  type UpstreamPager,
} from './extraction-pipeline';
import { ExtractionQueue, type ExtractionJobData } from './extraction-queue';

// §17.1's log test, through the extraction job rather than the bare client: a
// sentinel planted in every fetched field must never reach anything this
// pipeline can produce — a log line, an `ExtractionFailure`'s message (which
// is what `job_failed` and the operator's log line carry, spec §14.5), or the
// summary that becomes `extraction_job.result` and `job_completed`. Exercised
// on the three paths where an error handler reaches for the body — a 500
// mid-loop, a truncated page and an auth expiry mid-job — plus a clean run
// and a projection error.

const SENTINEL = 'SENTINEL-9d13ef';
let upstream: FakeUpstream;
let lines: string[];

const capture: LoggerService = {
  log: (m: unknown) => void lines.push(String(m)),
  warn: (m: unknown) => void lines.push(String(m)),
  error: (m: unknown) => void lines.push(String(m)),
};

beforeEach(async () => {
  lines = [];
  upstream = await createFakeUpstream({ rowsPerCode: 5, sentinel: SENTINEL });
});

afterEach(async () => {
  await upstream.close();
});

function client(): UpstreamClient {
  return new UpstreamClient(
    {
      baseUrl: upstream.url,
      token: upstream.token,
      timeoutMs: 1_000,
      sleep: () => Promise.resolve(),
    },
    capture,
  );
}

/** Rewrites one fetched field to a real-looking province code; every other
 * field still carries the sentinel. */
function withProvince(code: string): UpstreamPager {
  return {
    async *pages(groupCode, span) {
      for await (const page of client().pages(groupCode, span)) {
        yield {
          ...page,
          rows: page.rows.map((row) => ({ ...row, epidem_chw_code: code })),
        };
      }
    },
  };
}

function extract(pager: UpstreamPager, provinces = new Map<string, number>()) {
  return runExtraction(
    {
      requestId: 'req-1',
      reportCodes: ['201'],
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      provinces: [],
    },
    {
      upstream: pager,
      provinces,
      now: () => new Date(),
      sleep: () => Promise.resolve(),
      onCodeFetched: () => Promise.resolve(),
      touch: () => undefined,
      config: { codeMaxAttempts: 1 },
    },
  );
}

function everythingObservable(value: unknown): string {
  return [
    lines.join('\n'),
    inspect(value, { depth: 10, showHidden: true }),
    JSON.stringify(value),
    String((value as Error).message),
    String((value as Error).stack),
  ].join('\n');
}

function expectNoCaseData(observable: string): void {
  expect(observable).not.toContain(SENTINEL);
  expect(observable).not.toContain('SYNTHETIC');
}

it.each([
  ['500 mid-loop', { kind: 'server-error', page: 1, times: 99 }],
  ['truncated page', { kind: 'truncated-page', page: 1, times: 99 }],
  ['auth expiry mid-job', { kind: 'auth-expiry', afterRequests: 0 }],
] as const)(
  'never leaks a row or the sentinel on the %s path',
  async (_name, fault) => {
    upstream.setFault(fault);

    const error = await extract(client()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExtractionFailure);
    expect(lines.length).toBeGreaterThan(0);
    expectNoCaseData(everythingObservable(error));
  },
);

it('logs counts and codes on a clean run, and the summary holds no row', async () => {
  const result = await extract(withProvince('10'), new Map([['10', 1]]));

  expect(lines.join('\n')).toContain('total_items=5');
  expectNoCaseData(everythingObservable(result.summary));
});

it('never leaks a row on a projection error, and names only its index', async () => {
  const error = await extract(withProvince('57')).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ExtractionFailure);
  expect((error as Error).message).toContain('row 0');
  expect((error as Error).message).not.toContain('57');
  expectNoCaseData(everythingObservable(error));
});

describe('the BullMQ job payload', () => {
  it('carries the Request id and nothing fetched', async () => {
    const added: { data: unknown }[] = [];
    const queue = {
      add: (_name: string, data: ExtractionJobData) => {
        added.push({ data });
        return Promise.resolve();
      },
    } as unknown as Queue<ExtractionJobData>;

    await new ExtractionQueue(queue).enqueue('job-1', 'req-1');

    expect(added).toEqual([{ data: { requestId: 'req-1' } }]);
  });
});
