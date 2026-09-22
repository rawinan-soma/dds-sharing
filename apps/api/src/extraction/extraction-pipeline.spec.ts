import { describe, expect, it, vi } from 'vitest';
import { type UpstreamPage } from '../upstream/upstream-client';
import { UpstreamError } from '../upstream/upstream-error';
import {
  type CodeFetchedPayload,
  ExtractionFailure,
  runExtraction,
  type ExtractionPipelineDeps,
  type ExtractionTarget,
  type UpstreamPager,
} from './extraction-pipeline';

const PROVINCES = new Map([['10', 1]]);

function page(
  rows: number,
  totalItems: number,
  requestId = 'req-1',
): UpstreamPage {
  return {
    rows: Array.from({ length: rows }, (_, i) => ({
      epidem_report_guid: `GUID-${i}`,
      epidem_chw_code: 10,
      onset_date: '2025-06-15',
      birth_date: '2000-01-01',
    })),
    meta: {
      page: 1,
      pageSize: 10_000,
      totalItems,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
    requestId,
    processTimeMs: 1,
  };
}

/** One `.pages()` call's worth of behaviour: either a sequence of pages to
 * yield, or an UpstreamError to throw partway through the generator. */
type Attempt = { pages: UpstreamPage[] } | { error: UpstreamError };

class FakeUpstream implements UpstreamPager {
  private plan = new Map<string, Attempt[]>();
  calls: string[] = [];

  plan_for(groupCode: string, attempts: Attempt[]): void {
    this.plan.set(groupCode, attempts);
  }

  async *pages(groupCode: string): AsyncGenerator<UpstreamPage> {
    this.calls.push(groupCode);
    const attempts = this.plan.get(groupCode);
    if (!attempts || attempts.length === 0) {
      throw new Error(`no attempt planned for code ${groupCode}`);
    }
    const attempt = attempts.shift()!;
    if ('error' in attempt) throw attempt.error;
    for (const p of attempt.pages) yield await Promise.resolve(p);
  }
}

function upstreamErr(
  kind: UpstreamError['kind'],
  requestId: string | null = 'req-err',
) {
  return new UpstreamError({
    kind,
    groupCode: '201',
    page: 1,
    attempts: 1,
    requestId,
  });
}

function makeDeps(
  upstream: FakeUpstream,
  overrides: Partial<ExtractionPipelineDeps> = {},
): ExtractionPipelineDeps {
  const fetched: CodeFetchedPayload[] = [];
  return {
    upstream,
    provinces: PROVINCES,
    now: () => new Date('2026-01-01T00:00:00Z'),
    sleep: () => Promise.resolve(),
    onCodeFetched: (payload) => {
      fetched.push(payload);
      return Promise.resolve();
    },
    touch: () => undefined,
    ...overrides,
  };
}

const target: ExtractionTarget = {
  requestId: 'req-1',
  reportCodes: ['203', '202'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  provinces: [],
};

describe('runExtraction', () => {
  it('walks Report codes in ascending order, not the order given', async () => {
    const upstream = new FakeUpstream();
    upstream.plan_for('202', [{ pages: [page(2, 2)] }]);
    upstream.plan_for('203', [{ pages: [page(1, 1)] }]);

    await runExtraction(target, makeDeps(upstream));
    expect(upstream.calls).toEqual(['202', '203']);
  });

  it('produces projected rows in memory, per code, and a matching summary', async () => {
    const upstream = new FakeUpstream();
    upstream.plan_for('202', [{ pages: [page(2, 2)] }]);
    upstream.plan_for('203', [{ pages: [page(1, 1)] }]);

    const result = await runExtraction(target, makeDeps(upstream));
    expect(result.rowsByCode['202']).toHaveLength(2);
    expect(result.rowsByCode['203']).toHaveLength(1);
    expect(result.summary.rowsByCode).toEqual({ '202': 2, '203': 1 });
    expect(result.summary.totalItemsByCode).toEqual({ '202': 2, '203': 1 });
    expect(result.summary.xRequestIds).toEqual(['req-1', 'req-1']);
  });

  it('touches progress and reports code_fetched once per code, after each completes', async () => {
    const upstream = new FakeUpstream();
    upstream.plan_for('202', [{ pages: [page(1, 1)] }]);
    upstream.plan_for('203', [{ pages: [page(1, 1)] }]);

    const touch = vi.fn();
    const fetched: CodeFetchedPayload[] = [];
    await runExtraction(
      target,
      makeDeps(upstream, {
        touch,
        onCodeFetched: (payload) => {
          fetched.push(payload);
          return Promise.resolve();
        },
      }),
    );
    expect(touch).toHaveBeenCalledTimes(2);
    expect(fetched.map((f) => f.groupCode)).toEqual(['202', '203']);
    expect(fetched[0]).toMatchObject({ rowsReceived: 1, totalItems: 1 });
  });

  describe('completeness', () => {
    it('fails the job when rows received disagree with total_items', async () => {
      const upstream = new FakeUpstream();
      // meta says 5 but only 1 row rides along — a truncated response.
      upstream.plan_for('202', [{ pages: [page(1, 5)] }]);
      upstream.plan_for('203', [{ pages: [page(1, 1)] }]);

      const error = await runExtraction(target, makeDeps(upstream)).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ExtractionFailure);
      expect((error as ExtractionFailure).cause).toBe('completeness_mismatch');
      // The job stops at the first failing code and never reaches the next.
      expect(upstream.calls).toEqual(['202']);
    });
  });

  describe('code-level retry', () => {
    it('retries a failed code from page 1, and succeeds within the attempt budget', async () => {
      const upstream = new FakeUpstream();
      upstream.plan_for('202', [
        { error: upstreamErr('server_error') },
        { pages: [page(1, 1)] },
      ]);
      upstream.plan_for('203', [{ pages: [page(1, 1)] }]);

      const sleeps: number[] = [];
      const result = await runExtraction(
        target,
        makeDeps(upstream, {
          sleep: (ms) => {
            sleeps.push(ms);
            return Promise.resolve();
          },
          config: { codeMaxAttempts: 3, codeBackoffBaseMs: 10 },
        }),
      );
      expect(result.rowsByCode['202']).toHaveLength(1);
      expect(sleeps).toEqual([10]);
    });

    it('fails with the mapped cause once every attempt is exhausted', async () => {
      const upstream = new FakeUpstream();
      upstream.plan_for('202', [
        { error: upstreamErr('server_error') },
        { error: upstreamErr('server_error') },
        { error: upstreamErr('gateway_timeout', 'req-final') },
      ]);

      const error = await runExtraction(
        { ...target, reportCodes: ['202'] },
        makeDeps(upstream, {
          sleep: () => Promise.resolve(),
          config: { codeMaxAttempts: 3, codeBackoffBaseMs: 1 },
        }),
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ExtractionFailure);
      expect((error as ExtractionFailure).cause).toBe('upstream_5xx');
      expect((error as ExtractionFailure).xRequestId).toBe('req-final');
    });

    it('maps a dead token to auth_expiry, not upstream_5xx', async () => {
      const upstream = new FakeUpstream();
      upstream.plan_for('202', [
        { error: upstreamErr('token_invalid') },
        { error: upstreamErr('token_invalid') },
        { error: upstreamErr('token_invalid') },
      ]);

      const error = await runExtraction(
        { ...target, reportCodes: ['202'] },
        makeDeps(upstream, {
          sleep: () => Promise.resolve(),
          config: { codeMaxAttempts: 3, codeBackoffBaseMs: 1 },
        }),
      ).catch((e: unknown) => e);

      expect((error as ExtractionFailure).cause).toBe('auth_expiry');
    });

    it('a total_items that moves between attempts is not a special case: the latest attempt alone is asserted', async () => {
      const upstream = new FakeUpstream();
      upstream.plan_for('202', [
        // Attempt 1 fails after upstream had already reported 1 item.
        { error: upstreamErr('server_error') },
        // Attempt 2 succeeds cleanly with a different total (upstream kept
        // receiving reports between attempts) — 2, fully received.
        { pages: [page(2, 2)] },
      ]);

      const result = await runExtraction(
        { ...target, reportCodes: ['202'] },
        makeDeps(upstream, {
          sleep: () => Promise.resolve(),
          config: { codeMaxAttempts: 3, codeBackoffBaseMs: 1 },
        }),
      );
      expect(result.summary.totalItemsByCode['202']).toBe(2);
      expect(result.rowsByCode['202']).toHaveLength(2);
    });
  });

  it('fails with cause internal, never a blank cell, for a province outside the 77', async () => {
    const upstream = new FakeUpstream();
    const badRow = page(1, 1);
    badRow.rows[0].epidem_chw_code = 50; // not in PROVINCES
    upstream.plan_for('202', [{ pages: [badRow] }]);

    const error = await runExtraction(
      { ...target, reportCodes: ['202'] },
      makeDeps(upstream),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExtractionFailure);
    expect((error as ExtractionFailure).cause).toBe('internal');
  });

  it('counts a missing epidem_chw_code across the job, without dropping it from a national Request', async () => {
    const upstream = new FakeUpstream();
    const missing = page(1, 1);
    delete missing.rows[0].epidem_chw_code;
    upstream.plan_for('202', [{ pages: [missing] }]);

    const result = await runExtraction(
      { ...target, reportCodes: ['202'] },
      makeDeps(upstream),
    );
    expect(result.summary.missingEpidemChwCode).toBe(1);
    expect(result.rowsByCode['202']).toHaveLength(1);
  });
});
