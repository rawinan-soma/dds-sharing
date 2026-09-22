import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import {
  createFakeUpstream,
  type FakeUpstream,
} from '../../test/fake-upstream/fake-upstream';
import { buildSpan } from '../upstream/span-builder';
import { UpstreamClient } from '../upstream/upstream-client';
import { runExtraction } from './extraction-pipeline';

// §17.1's span-builder test: the Probe and the extraction job, given the same
// Request, must produce byte-identical `start_date`/`end_date`. Both call the
// one shared `buildSpan` (spec §7.2, §5.4) — the Probe does so directly in
// `probe.service.ts`, with no date arithmetic of its own (guarded by
// `span-builder-only.spec.ts`). This test proves the extraction pipeline's
// side of that promise: the query it actually sends upstream matches what
// `buildSpan` alone would produce for the same Request.

let upstream: FakeUpstream;

beforeEach(async () => {
  upstream = await createFakeUpstream({ rowsPerCode: 1 });
});

afterEach(async () => {
  await upstream.close();
});

describe('the extraction job sends buildSpan’s own output, verbatim', () => {
  it('for an ordinary range', async () =>
    testAgreement('2025-01-01', '2025-01-31'));

  it('for a single-day Request', async () =>
    testAgreement('2026-03-05', '2026-03-05'));

  it('across a year boundary, where the +1 crosses into the next year', async () =>
    testAgreement('2025-12-01', '2025-12-31'));

  async function testAgreement(startDate: string, endDate: string) {
    const expected = buildSpan({ from: startDate, to: endDate });

    const client = new UpstreamClient({
      baseUrl: upstream.url,
      token: upstream.token,
    });
    // Only the wire request matters here; the synthetic rows' geography
    // codes are not real province ids, so Project's own stale-table guard
    // (tested elsewhere) is expected to fail this run downstream of the
    // fetch this test is checking.
    await runExtraction(
      {
        requestId: 'req-1',
        reportCodes: ['201'],
        startDate,
        endDate,
        provinces: [],
      },
      {
        upstream: client,
        provinces: new Map(),
        now: () => new Date(),
        sleep: () => Promise.resolve(),
        onCodeFetched: () => Promise.resolve(),
        touch: () => undefined,
      },
    ).catch(() => undefined);

    expect(upstream.requests).toHaveLength(1);
    expect(upstream.requests[0].query.start_date).toBe(expected.startDate);
    expect(upstream.requests[0].query.end_date).toBe(expected.endDate);
  }
});
