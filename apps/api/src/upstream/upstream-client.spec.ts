import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import type { LoggerService } from '@nestjs/common';
import {
  createFakeUpstream,
  FakeUpstream,
} from '../../test/fake-upstream/fake-upstream';
import { buildSpan } from './span-builder';
import {
  ResponseInfo,
  UpstreamClient,
  UpstreamClientOptions,
} from './upstream-client';
import { UpstreamError, UpstreamErrorKind } from './upstream-error';
import { KNOWN_PARAMS, UPSTREAM_DEFAULTS } from './upstream.config';

const span = buildSpan({ from: '2025-01-01', to: '2025-12-31' });

let upstream: FakeUpstream;
let lines: string[];
let sleeps: number[];

const collector: LoggerService = {
  log: (m: unknown) => void lines.push(String(m)),
  warn: (m: unknown) => void lines.push(String(m)),
  error: (m: unknown) => void lines.push(String(m)),
};

function makeClient(overrides: Partial<UpstreamClientOptions> = {}) {
  return new UpstreamClient(
    {
      baseUrl: upstream.url,
      token: upstream.token,
      timeoutMs: 1_000,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      ...overrides,
    },
    collector,
  );
}

async function collect(client: UpstreamClient, code = '201') {
  const pages = [];
  for await (const page of client.pages(code, span)) pages.push(page);
  return pages;
}

async function kindOf(promise: Promise<unknown>): Promise<UpstreamError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UpstreamError);
    return error as UpstreamError;
  }
  throw new Error('expected the call to fail');
}

beforeEach(() => {
  lines = [];
  sleeps = [];
});

afterEach(async () => {
  await upstream?.close();
});

describe('the wire contract', () => {
  beforeEach(async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 25_000 });
  });

  it('always fetches at page_size=10000, page as a 1-based index, and stops on has_next false', async () => {
    const pages = await collect(makeClient());

    expect(pages.map((p) => p.meta.page)).toEqual([1, 2, 3]);
    expect(pages.map((p) => p.rows.length)).toEqual([10_000, 10_000, 5_000]);
    const asked = upstream.requests.map((r) => r.query);
    expect(asked.map((q) => q.page)).toEqual(['1', '2', '3']);
    expect(asked.every((q) => q.page_size === '10000')).toBe(true);
  });

  it('does not ask for a page past the end', async () => {
    await collect(makeClient());
    expect(upstream.requests).toHaveLength(3);
  });

  it('walks a single page once when there is one', async () => {
    await upstream.close();
    upstream = await createFakeUpstream({ rowsPerCode: 50 });
    const pages = await collect(makeClient());
    expect(pages).toHaveLength(1);
    expect(pages[0].meta.hasNext).toBe(false);
  });

  it('walks an empty result, from an unknown group_code, as one empty page', async () => {
    const pages = await collect(makeClient(), '999');
    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toEqual([]);
    expect(pages[0].meta.totalItems).toBe(0);
  });

  it('sends the span verbatim: end_date is the span builder’s exclusive day', async () => {
    await makeClient().probe('201', span);
    expect(upstream.requests[0].query).toMatchObject({
      start_date: '2025-01-01',
      end_date: '2026-01-01',
    });
  });

  it('sends a bearer token and only known-good parameter names', async () => {
    const client = makeClient();
    await client.probe('201', span);
    await collect(client);
    for (const request of upstream.requests) {
      expect(request.authorization).toBe(`Bearer ${upstream.token}`);
      expect(
        Object.keys(request.query).every((name) =>
          (KNOWN_PARAMS as readonly string[]).includes(name),
        ),
      ).toBe(true);
    }
  });

  it('probes with page_size=20, the minimum, one call', async () => {
    const page = await makeClient().probe('201', span);
    expect(upstream.requests).toHaveLength(1);
    expect(upstream.requests[0].query.page_size).toBe('20');
    expect(page.meta.totalItems).toBe(25_000);
  });

  it.each([0, 1, 19, -20, 10_001, 20.5, Number.NaN])(
    'never emits page_size %s',
    async (pageSize) => {
      await expect(
        makeClient().fetchPage({
          groupCode: '201',
          span,
          page: 1,
          pageSize,
        }),
      ).rejects.toThrow(RangeError);
      expect(upstream.requests).toHaveLength(0);
    },
  );

  it.each([0, -1, 1.5])('never emits page %s', async (page) => {
    await expect(
      makeClient().fetchPage({ groupCode: '201', span, page, pageSize: 20 }),
    ).rejects.toThrow(RangeError);
    expect(upstream.requests).toHaveLength(0);
  });

  it('accepts the documented bounds 20 and 10000', async () => {
    const client = makeClient();
    for (const pageSize of [20, 10_000]) {
      await client.fetchPage({ groupCode: '201', span, page: 1, pageSize });
    }
  });
});

describe('asserting meta echoes what was asked', () => {
  it.each([
    ['page', { page: 9 }],
    ['page_size', { page_size: 100 }],
  ])('fails when upstream echoes a different %s', async (_name, lie) => {
    upstream = await createFakeUpstream({ rowsPerCode: 50 });
    const real = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (...a) => {
        const res = await real(...a);
        const body = (await res.json()) as { meta: Record<string, unknown> };
        Object.assign(body.meta, lie);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: res.headers,
        });
      });
    try {
      const error = await kindOf(makeClient().probe('201', span));
      expect(error.kind).toBe('meta_mismatch');
      expect(upstream.requests).toHaveLength(1); // not retried: retrying cannot help
    } finally {
      spy.mockRestore();
    }
  });
});

describe('an inconsistent envelope', () => {
  it('fails loudly when upstream says has_next on what it called the last page', async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 50 });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        Response.json({
          status: true,
          message: 'OK',
          data: [],
          meta: {
            page: 1,
            page_size: 10_000,
            total_items: 5,
            total_pages: 1,
            has_next: true,
            has_previous: false,
          },
        }),
      ),
    );
    try {
      const error = await kindOf(collect(makeClient()));
      expect(error.kind).toBe('malformed_response');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the failure taxonomy', () => {
  beforeEach(async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 50 });
  });

  const probe = (client: UpstreamClient, over: Record<string, unknown> = {}) =>
    client.fetchPage({
      groupCode: '201',
      span,
      page: 1,
      pageSize: 20,
      ...over,
    });

  it('401 bad token → token_invalid, never retried', async () => {
    const error = await kindOf(probe(makeClient({ token: 'revoked' })));
    expect(error.kind).toBe('token_invalid');
    expect(error.status).toBe(401);
    expect(upstream.requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('400 over-365-day range → range_too_wide, never retried', async () => {
    const wide = { startDate: '2025-01-01', endDate: '2026-01-03' };
    const error = await kindOf(probe(makeClient(), { span: wide }));
    expect(error.kind).toBe('range_too_wide');
    expect(error.status).toBe(400);
    expect(upstream.requests).toHaveLength(1);
  });

  it('400 page too large → page_too_large, never retried', async () => {
    const error = await kindOf(probe(makeClient(), { page: 50 }));
    expect(error.kind).toBe('page_too_large');
    expect(upstream.requests).toHaveLength(1);
  });

  it('422 with errors[] → validation_error carrying the field names', async () => {
    const bad = { startDate: 'not-a-date', endDate: '2026-01-01' };
    const error = await kindOf(probe(makeClient(), { span: bad }));
    expect(error.kind).toBe('validation_error');
    expect(error.status).toBe(422);
    expect(error.fields).toEqual(['start_date']);
  });

  it('422 without errors[] (end before start) → validation_error, no fields', async () => {
    const reversed = { startDate: '2025-06-01', endDate: '2025-05-01' };
    const error = await kindOf(probe(makeClient(), { span: reversed }));
    expect(error.kind).toBe('validation_error');
    expect(error.fields).toEqual([]);
  });

  it('504 gateway timeout → gateway_timeout, retried', async () => {
    const real = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          Response.json(
            { status: false, message: 'Gateway Timeout' },
            { status: 504 },
          ),
        ),
      );
    try {
      const error = await kindOf(probe(makeClient()));
      expect(error.kind).toBe('gateway_timeout');
      expect(error.attempts).toBe(3);
    } finally {
      spy.mockRestore();
      expect(globalThis.fetch).toBe(real);
    }
  });

  it('gives every documented status a distinct outcome', () => {
    const kinds: UpstreamErrorKind[] = [
      'token_invalid',
      'validation_error',
      'range_too_wide',
      'page_too_large',
      'gateway_timeout',
    ];
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('retry discipline', () => {
  beforeEach(async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 25_000 });
  });

  it('defaults to 3 attempts and a 60 s per-request timeout, matching the gateway', () => {
    expect(UPSTREAM_DEFAULTS.maxAttempts).toBe(3);
    expect(UPSTREAM_DEFAULTS.timeoutMs).toBe(60_000);
  });

  it('recovers from a 500 mid-loop and reports the attempt', async () => {
    upstream.setFault({ kind: 'server-error', page: 2, times: 1 });
    const seen: number[] = [];
    const client = makeClient({ backoffBaseMs: 10 });
    const pages = [];
    for await (const p of client.pages('201', span, (info) =>
      seen.push(info.status),
    ))
      pages.push(p);

    expect(pages).toHaveLength(3);
    expect(seen).toEqual([200, 500, 200, 200]);
    expect(sleeps).toEqual([10]);
  });

  it('backs off exponentially and gives up after 3 attempts', async () => {
    upstream.setFault({ kind: 'server-error', page: 1, times: 99 });
    const error = await kindOf(
      makeClient({ backoffBaseMs: 100 }).probe('201', span),
    );
    expect(error.kind).toBe('server_error');
    expect(error.attempts).toBe(3);
    expect(upstream.requests).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('times a slow page out and retries it', async () => {
    upstream.setFault({ kind: 'slow-page', page: 1, delayMs: 400, times: 1 });
    const page = await makeClient({ timeoutMs: 100 }).probe('201', span);
    expect(page.meta.totalItems).toBe(25_000);
    expect(upstream.requests).toHaveLength(2);
  });

  it('reports a page that never answers as a timeout after 3 attempts', async () => {
    upstream.setFault({ kind: 'slow-page', page: 1, delayMs: 400, times: 99 });
    const error = await kindOf(
      makeClient({ timeoutMs: 50 }).probe('201', span),
    );
    expect(error.kind).toBe('timeout');
    expect(error.attempts).toBe(3);
  });

  it('retries a truncated page', async () => {
    upstream.setFault({ kind: 'truncated-page', page: 1, times: 1 });
    const page = await makeClient().probe('201', span);
    expect(page.meta.totalItems).toBe(25_000);
    expect(upstream.requests).toHaveLength(2);
  });

  it('gives up on a page that stays truncated', async () => {
    upstream.setFault({ kind: 'truncated-page', page: 1, times: 99 });
    const error = await kindOf(makeClient().probe('201', span));
    expect(error.kind).toBe('malformed_response');
    expect(error.attempts).toBe(3);
  });

  it('does not retry an auth expiry mid-job: no retry recovers a revoked token', async () => {
    upstream.setFault({ kind: 'auth-expiry', afterRequests: 1 });
    const client = makeClient();
    const error = await kindOf(collect(client));
    expect(error.kind).toBe('token_invalid');
    expect(error.page).toBe(2);
    expect(upstream.requests).toHaveLength(2);
  });

  it('exposes total_items on every page so a caller can guard a shifting total', async () => {
    upstream.setFault({ kind: 'shifting-total' });
    const client = makeClient();
    const first = await client.probe('201', span);
    const second = await client.probe('201', span);
    expect(second.meta.totalItems).not.toBe(first.meta.totalItems);
  });
});

describe('capturing x-request-id and x-process-time-ms', () => {
  beforeEach(async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 25_000 });
  });

  it('returns both on every successful page', async () => {
    const pages = await collect(makeClient());
    for (const page of pages) {
      expect(page.requestId).toMatch(/[0-9a-f-]{36}/);
      expect(page.processTimeMs).toEqual(expect.any(Number));
    }
    expect(new Set(pages.map((p) => p.requestId)).size).toBe(3);
  });

  it('reports every response, failures included, to the caller', async () => {
    upstream.setFault({ kind: 'server-error', page: 1, times: 1 });
    const infos: ResponseInfo[] = [];
    await makeClient().probe('201', span, (info) => infos.push(info));
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({
      status: 500,
      attempt: 1,
      groupCode: '201',
    });
    expect(infos[1]).toMatchObject({
      status: 200,
      attempt: 2,
      totalItems: 25_000,
    });
    expect(infos.every((i) => typeof i.requestId === 'string')).toBe(true);
  });

  it('puts both on the error, because the request id is what DDC support needs', async () => {
    const error = await kindOf(
      makeClient({ token: 'revoked' }).probe('201', span),
    );
    expect(error.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(error.processTimeMs).toEqual(expect.any(Number));
  });
});

describe('log discipline: no response body ever reaches a log line', () => {
  const SENTINEL = 'SENTINEL-4f2a9c';

  beforeEach(async () => {
    upstream = await createFakeUpstream({
      rowsPerCode: 25_000,
      sentinel: SENTINEL,
    });
  });

  function everythingObservable(error: unknown): string {
    return [
      lines.join('\n'),
      inspect(error, { depth: 10, showHidden: true }),
      JSON.stringify(error),
      String((error as Error).message),
      String((error as Error).stack),
    ].join('\n');
  }

  it('logs status, code, page and total_items on success — and nothing of a row', async () => {
    await collect(makeClient());
    const log = lines.join('\n');
    expect(log).toContain('status=200');
    expect(log).toContain('code=201');
    expect(log).toContain('page=2');
    expect(log).toContain('total_items=25000');
    expect(log).not.toContain(SENTINEL);
    expect(log).not.toContain('SYNTHETIC');
  });

  it.each([
    ['500 mid-loop', { kind: 'server-error', page: 1, times: 99 }],
    ['truncated page', { kind: 'truncated-page', page: 1, times: 99 }],
    ['auth expiry', { kind: 'auth-expiry', afterRequests: 0 }],
  ] as const)('never leaks the body on the %s path', async (_name, fault) => {
    upstream.setFault(fault);
    const error = await kindOf(makeClient().probe('201', span));
    expect(lines.length).toBeGreaterThan(0);
    expect(everythingObservable(error)).not.toContain(SENTINEL);
    expect(everythingObservable(error)).not.toContain('SYNTHETIC');
  });

  it('never leaks the body of a 4xx either', async () => {
    const error = await kindOf(
      makeClient().fetchPage({
        groupCode: '201',
        span,
        page: 5000,
        pageSize: 20,
      }),
    );
    expect(everythingObservable(error)).not.toContain(SENTINEL);
  });
});
