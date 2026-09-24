/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/clock/clock';
import { hashToken } from '../src/delivery/token';
import { ExtractionQueue } from '../src/extraction/extraction-queue';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import { Browser, TestClock } from './support/browser';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const ict = (local: string) => new Date(`${local}:00+07:00`);
const HOUR = 60 * 60 * 1000;

// The in-flight list (spec §10.9): approved and not yet terminal, derived at
// read time from what the record holds — seeded here directly, against a
// real database.
describe('the in-flight list (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let appPool: Pool;
  const reviewers: Record<string, { id: string; browser: Browser }> = {};
  // Tuesday 10:00 ICT.
  const clock = new TestClock(ict('2026-09-22T10:00').getTime());
  const originalUrl = process.env.APP_DATABASE_URL;

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

  /**
   * An approved Request, submitted at `submitted`, approved by `approver`,
   * whose newest job is `job`.
   */
  async function approved(
    approver: string,
    job: 'queued' | 'running' | 'succeeded' | 'failed',
    submitted = '2026-09-21T09:00',
  ): Promise<string> {
    const [row] = await q(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, 'approved', $2, 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', '{202}', '{}') RETURNING id`,
      [`REQ-TEST-${randomUUID().slice(0, 8)}`, ict(submitted)],
    );
    await q(
      `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
       VALUES ($1, 'Somchai', 'Jaidee', '081 234 5678', 'somchai@example.go.th',
               'Regional Office 1')`,
      [row.id],
    );
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, reviewer_id,
         occurred_at, payload)
       VALUES ($1, 'approved', 'reviewer', $2, $3, '{"snapshot": {"workplace": "Snapshot Office"}}')`,
      [row.id, reviewers[approver].id, ict('2026-09-21T09:30')],
    );
    await q(`INSERT INTO extraction_job (request_id, status) VALUES ($1, $2)`, [
      row.id,
      job,
    ]);
    return row.id as string;
  }

  /** A live Download token for `id`, expiring `hoursLeft` from now. */
  async function token(id: string, hoursLeft: number, rawToken = randomUUID()) {
    const expires = new Date(clock.now().getTime() + hoursLeft * HOUR);
    await q(
      `INSERT INTO download_token (request_id, token_hash, archive_filename, created_at, expires_at)
       VALUES ($1, $2, 'dds-envocc-sharing-20260921-090000.zip', $3, $4)`,
      [
        id,
        hashToken(rawToken),
        new Date(expires.getTime() - 72 * HOUR),
        expires,
      ],
    );
    return rawToken;
  }

  const ready = async (approver: string, submitted?: string) => {
    const id = await approved(approver, 'succeeded', submitted);
    await token(id, 48);
    return id;
  };

  async function systemEvent(
    requestId: string,
    type: string,
    payload: Record<string, unknown> = {},
  ) {
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
       VALUES ($1, $2, 'system', $3, $4)`,
      [requestId, type, clock.now(), payload],
    );
  }

  const listSeenBy = async (who: string) =>
    (await reviewers[who].browser.get('/api/reviewer/queue')).body.inFlight;
  const rowOf = async (who: string, id: string) =>
    (await listSeenBy(who)).find((r: any) => r.requestId === id);
  const detail = (who: string, id: string) =>
    reviewers[who].browser.get(`/api/reviewer/in-flight/${id}`);

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    appPool = new Pool({ connectionString: scratch.appUrl });
    appPool.on('error', () => {});

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(ExtractionQueue)
      .useValue({ enqueue: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    await app.listen(0);
    const server = app.getHttpServer() as App;

    const accounts = new ReviewerAccounts(drizzle(appPool), clock);
    for (const name of ['alice', 'bob']) {
      const seeded = await accounts.seed({
        username: name,
        displayName: `${name[0].toUpperCase()}${name.slice(1)} Reviewer`,
        email: `${name}@example.go.th`,
      });
      await q(
        `UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false
         WHERE id = $1`,
        [seeded.reviewerId],
      );
      const browser = new Browser(server);
      await browser.get('/api/reviewer/session');
      const res = await browser.post('/api/reviewer/sign-in', {
        username: name,
        password: seeded.password,
        code: phoneCode(seeded.totpSecret, clock.now().getTime()),
      });
      expect(res.status).toBe(200);
      reviewers[name] = { id: seeded.reviewerId, browser };
    }
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    process.env.APP_DATABASE_URL = originalUrl;
    await scratch.drop();
  });

  describe('the list', () => {
    it('reads the extraction state and gates the actions by it', async () => {
      const extracting = await approved('alice', 'running');
      const readyId = await ready('alice');
      const failed = await approved('alice', 'failed');

      expect(await rowOf('alice', extracting)).toMatchObject({
        extraction: 'extracting',
        linkExpiresAt: null,
        actions: { rerun: false, resend: false },
      });
      expect(await rowOf('alice', readyId)).toMatchObject({
        reference: expect.stringMatching(/^REQ-TEST-/),
        requesterName: 'Somchai Jaidee',
        diseaseGroupName: 'โรคซิลิโคสิส',
        extraction: 'ready',
        linkExpiresAt: new Date(
          clock.now().getTime() + 48 * HOUR,
        ).toISOString(),
        actions: { rerun: true, resend: true },
      });
      expect(await rowOf('alice', failed)).toMatchObject({
        extraction: 'failed',
        actions: { rerun: true, resend: false },
      });
    });

    it("is everyone's: another Reviewer sees the row, and the approver's name is not on it", async () => {
      const id = await ready('alice');
      const row = await rowOf('bob', id);
      expect(row).toBeDefined();
      expect(JSON.stringify(row)).not.toContain('Alice');
    });

    it('lets any active Reviewer act on any of them', async () => {
      const id = await ready('alice');
      const res = await reviewers.bob.browser.post(
        `/api/reviewer/requests/${id}/rerun`,
      );
      expect(res.status).toBe(200);
      expect(await rowOf('alice', id)).toMatchObject({
        extraction: 'extracting',
      });
    });

    it('sorts by submit order, oldest first, and by nothing more urgent', async () => {
      const newest = await approved('alice', 'failed', '2026-09-10T11:00');
      const oldest = await ready('alice', '2026-09-10T09:00');
      const middle = await approved('alice', 'running', '2026-09-10T10:00');
      const order = (await listSeenBy('alice'))
        .map((r: any) => r.requestId)
        .filter((id: string) => [newest, oldest, middle].includes(id));
      expect(order).toEqual([oldest, middle, newest]);
    });

    it('holds no pending, rejected or terminal Request', async () => {
      const ids = [];
      for (const state of [
        'pending',
        'rejected',
        'collected',
        'expired_uncollected',
        'abandoned',
      ]) {
        const id = await ready('alice');
        await q('UPDATE request SET state = $2 WHERE id = $1', [id, state]);
        ids.push(id);
      }
      const listed = (await listSeenBy('alice')).map((r: any) => r.requestId);
      for (const id of ids) expect(listed).not.toContain(id);
    });

    it('drops a Request whose link lapsed uncollected before the tick records it, and offers it nothing (ADR 0016)', async () => {
      const id = await approved('alice', 'succeeded');
      await token(id, -0.1);
      expect(await rowOf('alice', id)).toBeUndefined();
      const rerun = await reviewers.alice.browser.post(
        `/api/reviewer/requests/${id}/rerun`,
      );
      const resend = await reviewers.alice.browser.post(
        `/api/reviewer/requests/${id}/resend`,
      );
      expect([rerun.status, resend.status]).toEqual([404, 404]);
      expect((await detail('alice', id)).status).toBe(404);
    });

    it('exposes no Re-run or resend on a terminal Request', async () => {
      const id = await ready('alice');
      await q(`UPDATE request SET state = 'collected' WHERE id = $1`, [id]);
      for (const action of ['rerun', 'resend']) {
        const res = await reviewers.alice.browser.post(
          `/api/reviewer/requests/${id}/${action}`,
        );
        expect(res.status).toBe(404);
      }
      expect(
        await q(
          `SELECT 1 FROM request_event WHERE request_id = $1 AND type = 'extraction_rerun_queued'`,
          [id],
        ),
      ).toEqual([]);
    });

    it('suppresses the row of a Request with an open Alert, and returns it once the Alert is cleared', async () => {
      const id = await approved('alice', 'failed');
      await systemEvent(id, 'job_failed', {
        cause: 'internal',
        xRequestId: null,
      });
      await systemEvent(id, 'extraction_alert_raised');
      expect(await rowOf('alice', id)).toBeUndefined();
      expect((await detail('alice', id)).status).toBe(404);

      const cleared = await reviewers.alice.browser.post(
        `/api/reviewer/alerts/${id}/clear`,
        { kind: 'extraction_failure', outcome: 'contacted_requester' },
      );
      expect(cleared.body.zone).toBe('in_flight');
      expect(await rowOf('alice', id)).toMatchObject({ extraction: 'failed' });
    });

    it('never carries the Download token', async () => {
      const id = await approved('alice', 'succeeded');
      const raw = await token(id, 48);
      const body = JSON.stringify([
        await listSeenBy('alice'),
        (await detail('alice', id)).body,
      ]);
      expect(body).not.toContain(raw);
      expect(body).not.toContain(hashToken(raw));
    });
  });

  describe('the detail (ADR 0015)', () => {
    it('shows the five live contact fields from the Request, never the Snapshot', async () => {
      const id = await ready('alice');
      const res = await detail('bob', id);
      expect(res.status).toBe(200);
      expect(res.body.contact).toEqual({
        name: 'Somchai',
        surname: 'Jaidee',
        tel: '081 234 5678',
        email: 'somchai@example.go.th',
        workplace: 'Regional Office 1',
      });
      expect(JSON.stringify(res.body)).not.toContain('Snapshot Office');
    });

    it('names the approving Reviewer on the decision line, with the ask, the file and the actions', async () => {
      const id = await ready('alice');
      await q(
        `INSERT INTO token_lookup (download_token_id, request_id, token_prefix, kind, outcome, ip, user_agent, occurred_at)
         SELECT id, request_id, 'abcdefgh', 'page', 'success', '127.0.0.1', 't', now()
         FROM download_token WHERE request_id = $1`,
        [id],
      );
      const res = await detail('bob', id);
      expect(res.body).toMatchObject({
        requestId: id,
        reference: expect.stringMatching(/^REQ-TEST-/),
        diseaseGroupName: 'โรคซิลิโคสิส',
        reportCodes: ['202'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        area: { kind: 'national' },
        approvedBy: 'Alice Reviewer',
        approvedAt: ict('2026-09-21T09:30').toISOString(),
        extraction: 'ready',
        file: {
          archiveFilename: 'dds-envocc-sharing-20260921-090000.zip',
          // A page view is a lookup, not an Attempt (ADR 0018).
          attempts: 0,
        },
        actions: { rerun: true, resend: true },
      });
    });

    it('is not found for a pending Request', async () => {
      const id = await ready('alice');
      await q(`UPDATE request SET state = 'pending' WHERE id = $1`, [id]);
      expect((await detail('alice', id)).status).toBe(404);
    });
  });
});
