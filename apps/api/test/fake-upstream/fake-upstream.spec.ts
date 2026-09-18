import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeUpstream, FakeUpstream } from './fake-upstream';

// The harness is an implementers' dev tool, not a product deliverable. These
// specs pin that it behaves like the verified upstream (spec §5), because the
// client's own specs are only as honest as the thing they run against.

interface Body {
  status: boolean;
  message: string;
  data: unknown[];
  meta: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
  errors?: { field: string; message: string }[];
}

let upstream: FakeUpstream;

afterEach(async () => {
  await upstream?.close();
});

async function get(
  query: Record<string, string>,
  token: string | null = upstream.token,
) {
  const url = new URL(`${upstream.url}/disease-groups`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });
  return { res, body: (await res.json()) as Body };
}

const year = {
  group_code: '201',
  start_date: '2025-01-01',
  end_date: '2026-01-01',
  page_size: '10000',
  page: '1',
};

describe('the fake upstream, healthy', () => {
  beforeEach(async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 25_000 });
  });

  it('serves the envelope with a 1-based page index', async () => {
    const { res, body } = await get(year);
    expect(res.status).toBe(200);
    expect(body.status).toBe(true);
    expect(body.data).toHaveLength(10_000);
    expect(body.meta).toMatchObject({
      page: 1,
      page_size: 10_000,
      total_items: 25_000,
      total_pages: 3,
      has_next: true,
      has_previous: false,
    });
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('x-process-time-ms')).toBeTruthy();
  });

  it('ends on a short last page with has_next false, then 200 past the end', async () => {
    const last = await get({ ...year, page: '3' });
    expect(last.body.data).toHaveLength(5_000);
    expect(last.body.meta.has_next).toBe(false);

    const past = await get({ ...year, page: '4' });
    expect(past.res.status).toBe(200);
    expect(past.body.data).toEqual([]);
  });

  it('treats end_date as exclusive', async () => {
    const inclusive = await get({
      ...year,
      start_date: '2025-12-31',
      end_date: '2026-01-01',
    });
    const empty = await get({
      ...year,
      start_date: '2025-12-31',
      end_date: '2025-12-31',
    });
    expect(inclusive.body.meta.total_items).toBeGreaterThan(0);
    expect(empty.body.meta.total_items).toBe(0);
  });

  it('answers an unknown group_code with 200 and no rows, not 404', async () => {
    const { res, body } = await get({ ...year, group_code: '999' });
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.total_items).toBe(0);
  });

  it('silently ignores an unknown query parameter', async () => {
    const { res, body } = await get({ ...year, gruop_code: '999' });
    expect(res.status).toBe(200);
    expect(body.meta.total_items).toBe(25_000);
  });

  it('reproduces the documented failure taxonomy', async () => {
    expect((await get(year, 'wrong')).res.status).toBe(401);
    expect((await get(year, null)).res.status).toBe(401);

    const small = await get({ ...year, page_size: '19' });
    expect(small.res.status).toBe(422);
    expect(small.body.errors?.[0]?.field).toBe('page_size');

    expect((await get({ ...year, page: '0' })).res.status).toBe(422);

    const badDate = await get({ ...year, start_date: '01-01-2025' });
    expect(badDate.res.status).toBe(422);
    expect(badDate.body.errors?.[0]?.field).toBe('start_date');

    const reversed = await get({
      ...year,
      start_date: '2025-06-01',
      end_date: '2025-05-01',
    });
    expect(reversed.res.status).toBe(422);
    expect(reversed.body.errors).toBeUndefined();

    const wide = await get({ ...year, end_date: '2026-01-03' });
    expect(wide.res.status).toBe(400);
    expect(wide.body.message).toMatch(/must not exceed 1 year/);

    const tooFar = await get({ ...year, page: '50' });
    expect(tooFar.res.status).toBe(400);
    expect(tooFar.body.message).toBe('Page too large');
  });

  it('carries no real data: every field is synthetic and marked', async () => {
    const { body } = await get({ ...year, page_size: '20' });
    expect(JSON.stringify(body.data[0])).toContain('SYNTHETIC');
  });

  it('records what it was asked, so a spec can inspect the wire', async () => {
    await get({ ...year, page_size: '20', bogus: '1' });
    expect(upstream.requests.at(-1)?.query).toMatchObject({
      page_size: '20',
      bogus: '1',
    });
  });
});

describe('the five fault paths', () => {
  beforeEach(async () => {
    upstream = await createFakeUpstream({ rowsPerCode: 25_000 });
  });

  it('500 mid-loop: page 2 fails, then recovers', async () => {
    upstream.setFault({ kind: 'server-error', page: 2, times: 1 });
    expect((await get(year)).res.status).toBe(200);
    expect((await get({ ...year, page: '2' })).res.status).toBe(500);
    expect((await get({ ...year, page: '2' })).res.status).toBe(200);
  });

  it('slow page: the response is held back', async () => {
    upstream.setFault({ kind: 'slow-page', page: 1, delayMs: 150, times: 1 });
    const started = Date.now();
    await get(year);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });

  it('truncated page: the body ends mid-JSON', async () => {
    upstream.setFault({ kind: 'truncated-page', page: 1, times: 1 });
    await expect(get(year)).rejects.toThrow();
    expect((await get(year)).res.status).toBe(200);
  });

  it('auth expiry mid-job: 401 after N good requests', async () => {
    upstream.setFault({ kind: 'auth-expiry', afterRequests: 2 });
    expect((await get(year)).res.status).toBe(200);
    expect((await get({ ...year, page: '2' })).res.status).toBe(200);
    const expired = await get({ ...year, page: '3' });
    expect(expired.res.status).toBe(401);
    expect(expired.body.message).toBe('Token invalid');
  });

  it('total_items shifts between attempts', async () => {
    upstream.setFault({ kind: 'shifting-total' });
    const first = await get(year);
    const second = await get(year);
    expect(second.body.meta.total_items).not.toBe(first.body.meta.total_items);
  });

  it('plants the sentinel in error bodies as well as rows', async () => {
    await upstream.close();
    upstream = await createFakeUpstream({ sentinel: 'SENTINEL-XYZ' });
    upstream.setFault({ kind: 'server-error', page: 1, times: 1 });
    const { body } = await get(year);
    expect(JSON.stringify(body)).toContain('SENTINEL-XYZ');
  });
});
