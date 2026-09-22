import { inspect } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createFakeUpstream,
  type FakeUpstream,
} from '../../test/fake-upstream/fake-upstream';
import { UpstreamClient } from '../upstream/upstream-client';
import { ExtractionFailure, runExtraction } from './extraction-pipeline';

// §17.1's log test, through the extraction job rather than the bare client: a
// sentinel planted in every fetched field must never reach anything this
// pipeline can produce — an `ExtractionFailure`'s message, most of all, since
// that message is exactly what `job_failed` and the operator's log line carry
// (spec §14.5). Exercised on the same three paths as the client-level test:
// a 500 mid-loop, a truncated page, and an auth expiry mid-job.

const SENTINEL = 'SENTINEL-9d13ef';
let upstream: FakeUpstream;

beforeEach(async () => {
  upstream = await createFakeUpstream({ rowsPerCode: 5, sentinel: SENTINEL });
});

afterEach(async () => {
  await upstream.close();
});

function everythingObservable(error: unknown): string {
  return [
    inspect(error, { depth: 10, showHidden: true }),
    JSON.stringify(error),
    String((error as Error).message),
    String((error as Error).stack),
  ].join('\n');
}

it.each([
  ['500 mid-loop', { kind: 'server-error', page: 1, times: 99 }],
  ['truncated page', { kind: 'truncated-page', page: 1, times: 99 }],
  ['auth expiry mid-job', { kind: 'auth-expiry', afterRequests: 0 }],
] as const)(
  'never leaks a row or the sentinel on the %s path',
  async (_name, fault) => {
    upstream.setFault(fault);
    const client = new UpstreamClient({
      baseUrl: upstream.url,
      token: upstream.token,
      timeoutMs: 1_000,
      sleep: () => Promise.resolve(),
    });

    const error = await runExtraction(
      {
        requestId: 'req-1',
        reportCodes: ['201'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        provinces: [],
      },
      {
        upstream: client,
        provinces: new Map(),
        now: () => new Date(),
        sleep: () => Promise.resolve(),
        onCodeFetched: () => Promise.resolve(),
        touch: () => undefined,
        config: { codeMaxAttempts: 1 },
      },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExtractionFailure);
    const observable = everythingObservable(error);
    expect(observable).not.toContain(SENTINEL);
    expect(observable).not.toContain('SYNTHETIC');
  },
);
