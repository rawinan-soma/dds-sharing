/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   rows from pg are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ProbeService } from '../src/requests/probe.service';
import {
  createFakeUpstream,
  FakeUpstream,
} from './fake-upstream/fake-upstream';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// The Probe (spec §5.4), against a real database and a real (fake) upstream:
// one page_size=20 call per Report code, off the submit path, terminal on
// exhaustion.
describe('the Probe (e2e)', () => {
  let scratch: ScratchDatabase;
  let upstream: FakeUpstream;
  let app: INestApplication<App>;
  let probeService: ProbeService;

  const original = {
    dbUrl: process.env.APP_DATABASE_URL,
    baseUrl: process.env.UPSTREAM_BASE_URL,
    token: process.env.UPSTREAM_TOKEN,
    insecure: process.env.ALLOW_INSECURE_TRANSPORT,
  };

  async function waitFor(
    predicate: () => Promise<boolean>,
    { timeoutMs = 2_000, intervalMs = 20 } = {},
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('timed out waiting for condition');
  }

  async function insertRequest(codes: string[]): Promise<string> {
    const { rows } = await scratch.owner.query(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, 'pending', now(), 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', $2, '{}')
       RETURNING id`,
      [`REQ-TEST-${randomUUID().slice(0, 8)}`, codes],
    );
    return rows[0].id as string;
  }

  async function events(
    requestId: string,
  ): Promise<{ type: string; payload: Record<string, unknown> }[]> {
    const { rows } = await scratch.owner.query(
      'SELECT type, payload FROM request_event WHERE request_id = $1 ORDER BY id',
      [requestId],
    );
    return rows as { type: string; payload: Record<string, unknown> }[];
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    upstream = await createFakeUpstream({ rowsPerCode: 100 });
    process.env.APP_DATABASE_URL = scratch.appUrl;
    process.env.UPSTREAM_BASE_URL = upstream.url;
    process.env.UPSTREAM_TOKEN = upstream.token;
    process.env.ALLOW_INSECURE_TRANSPORT = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    probeService = moduleRef.get(ProbeService);
  });

  afterAll(async () => {
    await app.close();
    process.env.APP_DATABASE_URL = original.dbUrl;
    process.env.UPSTREAM_BASE_URL = original.baseUrl;
    process.env.UPSTREAM_TOKEN = original.token;
    process.env.ALLOW_INSECURE_TRANSPORT = original.insecure;
    await upstream.close();
    await scratch.drop();
  });

  beforeEach(async () => {
    await scratch.owner.query(
      'TRUNCATE request_event, request_contact, request CASCADE',
    );
    upstream.requests.length = 0;
    upstream.setFault(null);
  });

  describe('ProbeService.run', () => {
    it('makes exactly one page_size=20 call per Report code, in ascending order', async () => {
      const id = await insertRequest(['203', '202']);
      await probeService.run({
        requestId: id,
        reportCodes: ['203', '202'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(upstream.requests.map((r) => r.query.group_code)).toEqual([
        '202',
        '203',
      ]);
      expect(upstream.requests.every((r) => r.query.page_size === '20')).toBe(
        true,
      );
    });

    it('takes the span from the shared span builder: exclusive end_date, no arithmetic of its own', async () => {
      const id = await insertRequest(['202']);
      await probeService.run({
        requestId: id,
        reportCodes: ['202'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(upstream.requests[0].query).toMatchObject({
        start_date: '2025-01-01',
        end_date: '2025-02-01',
      });
    });

    it('writes probe_performed with per-code and summed totals, the span, the call count and every x-request-id', async () => {
      const id = await insertRequest(['202', '203']);
      await probeService.run({
        requestId: id,
        reportCodes: ['202', '203'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      const [event] = await events(id);
      expect(event.type).toBe('probe_performed');
      expect(event.payload).toMatchObject({
        reportCodes: ['202', '203'],
        callsMade: 2,
        spanStart: '2025-01-01',
        spanEnd: '2025-02-01',
        totalItemsByCode: { '202': 31, '203': 31 },
        totalItems: 62,
      });
      expect(event.payload.xRequestIds).toHaveLength(2);
    });

    it('catches a code with no matching rows as a zero, not a block', async () => {
      const id = await insertRequest(['999']);
      await probeService.run({
        requestId: id,
        reportCodes: ['999'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      const [event] = await events(id);
      expect(event.type).toBe('probe_performed');
      expect(event.payload.totalItems).toBe(0);
    });

    it('abandons the whole Probe when a code exhausts its 3 attempts, and writes probe_failed', async () => {
      const id = await insertRequest(['202', '203']);
      upstream.setFault({ kind: 'server-error', page: 1, times: 99 });

      await probeService.run({
        requestId: id,
        reportCodes: ['202', '203'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      const rows = await events(id);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('probe_failed');
      expect(rows[0].payload).toMatchObject({ groupCode: '202' });
      // 3 attempts on the first (failing) code only: '203' is never reached.
      expect(upstream.requests).toHaveLength(3);
      expect(upstream.requests.every((r) => r.query.group_code === '202')).toBe(
        true,
      );
      // One relayed error per attempt, not just the last: every one of them
      // reached upstream and is owed a record.
      const errors = rows[0].payload.errors as {
        message: string;
        xRequestId: string | null;
      }[];
      expect(errors).toHaveLength(3);
      expect(errors.every((e) => typeof e.xRequestId === 'string')).toBe(true);
      expect(new Set(errors.map((e) => e.xRequestId)).size).toBe(3);
    });

    it('raises no Alert-shaped event on abandonment: only probe_failed', async () => {
      const id = await insertRequest(['202']);
      upstream.setFault({ kind: 'server-error', page: 1, times: 99 });

      await probeService.run({
        requestId: id,
        reportCodes: ['202'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      const rows = await events(id);
      expect(rows.map((r) => r.type)).toEqual(['probe_failed']);
    });

    it('never rejects, even when writing its own event fails', async () => {
      // No such Request row: writeRequestEvent's FK violates, inside run()'s
      // own try/catch. Nothing waits on the Probe — not even its own errors.
      await expect(
        probeService.run({
          requestId: randomUUID(),
          reportCodes: ['202'],
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('wired off the submit path', () => {
    const contact = {
      name: 'Somchai',
      surname: 'Jaidee',
      tel: '081 234 5678',
      email: 'somchai@example.go.th',
      workplace: 'Regional Office 1',
    };

    it('answers submit before the Probe lands, then fills the queue’s count in behind', async () => {
      // A held-back response guarantees the Probe has not finished by the time
      // the submit response is back, without asserting on wall-clock timing.
      upstream.setFault({
        kind: 'slow-page',
        page: 1,
        delayMs: 300,
        times: 99,
      });

      const res = await request(app.getHttpServer())
        .post('/api/requests')
        .set('X-Forwarded-For', '10.0.0.9')
        .set('User-Agent', 'vitest-agent/1.0')
        .send({
          diseaseGroupId: 'silicosis',
          from: '2025-01-01',
          to: '2025-01-31',
          contact,
        });
      expect(res.status).toBe(201);

      const {
        rows: [{ id }],
      } = await scratch.owner.query<{ id: string }>(
        'SELECT id FROM request WHERE reference = $1',
        [res.body.reference as string],
      );
      const probeTypes = async () =>
        (await events(id))
          .map((e) => e.type)
          .filter((t) => t === 'probe_performed' || t === 'probe_failed');
      expect(await probeTypes()).toEqual([]);

      await waitFor(async () => (await probeTypes()).length > 0);
      const rows = await events(id);
      expect(rows.map((r) => r.type)).toEqual(['submitted', 'probe_performed']);
      const probePerformed = rows.find((r) => r.type === 'probe_performed')!;
      expect(probePerformed.payload.totalItems).toBe(62);
    });
  });
});
