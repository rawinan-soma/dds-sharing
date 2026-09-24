/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { systemClock } from '../src/clock/clock';
import { ARCHIVE_STORE } from '../src/extraction/extraction.module';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { MAIL_TRANSPORT } from '../src/mail/mail.module';
import { type MailTransport } from '../src/mail/mail-transport';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import {
  createFakeUpstream,
  FakeUpstream,
} from './fake-upstream/fake-upstream';
import { Browser } from './support/browser';
import { fakeArchiveStore } from './support/fake-archive-store';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// Re-run and resend (spec §10.7, §10.8), wired for real: a Reviewer presses
// the button over HTTP, a real BullMQ job runs against the fake upstream, and
// the record is read back out of Postgres. Report code `999` has no rows, so a
// run succeeds; a server-error fault makes one fail.
describe('Re-run and resend (e2e)', () => {
  let scratch: ScratchDatabase;
  let upstream: FakeUpstream;
  let app: INestApplication<App>;
  let appPool: Pool;
  let browser: Browser;
  let reviewerId: string;
  const sent: { to: string; html: string }[] = [];

  const original = {
    dbUrl: process.env.APP_DATABASE_URL,
    baseUrl: process.env.UPSTREAM_BASE_URL,
    token: process.env.UPSTREAM_TOKEN,
    insecure: process.env.ALLOW_INSECURE_TRANSPORT,
  };

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

  async function waitFor(
    predicate: () => Promise<boolean>,
    { timeoutMs = 20_000, intervalMs = 25 } = {},
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('timed out waiting for condition');
  }

  const eventsOf = (id: string, type?: string) =>
    q(
      `SELECT * FROM request_event WHERE request_id = $1
       ${type ? 'AND type = $2' : ''} ORDER BY id`,
      type ? [id, type] : [id],
    );
  const jobsOf = (id: string) =>
    q(
      'SELECT status FROM extraction_job WHERE request_id = $1 ORDER BY created_at',
      [id],
    );
  const tokensOf = (id: string) =>
    q(
      `SELECT id, archive_filename, created_at, expires_at, revoked_at
       FROM download_token WHERE request_id = $1 ORDER BY created_at`,
      [id],
    );
  const settled = (id: string, runs: number) =>
    waitFor(async () => {
      const jobs = await jobsOf(id);
      return (
        jobs.length === runs &&
        jobs.every((j) => j.status === 'succeeded' || j.status === 'failed')
      );
    });

  /** A pending Request for code `999`, approved over HTTP, first run settled. */
  async function approvedAndExtracted(): Promise<string> {
    const reference = `REQ-TEST-${randomUUID().slice(0, 8)}`;
    const [row] = await q(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, 'pending', now(), 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', '{999}', '{}') RETURNING id`,
      [reference],
    );
    await q(
      `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
       VALUES ($1, 'Somchai', 'Jaidee', '081 234 5678', $2, 'Regional Office 1')`,
      [row.id, `${reference.toLowerCase()}@example.go.th`],
    );
    const res = await browser.post(`/api/reviewer/queue/${row.id}/approve`);
    expect(res.status).toBe(200);
    await settled(row.id, 1);
    return row.id as string;
  }

  const rerun = (id: string, body: unknown = {}) =>
    browser.post(`/api/reviewer/requests/${id}/rerun`, body);

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    upstream = await createFakeUpstream({ rowsPerCode: 5 });
    process.env.APP_DATABASE_URL = scratch.appUrl;
    process.env.UPSTREAM_BASE_URL = upstream.url;
    process.env.UPSTREAM_TOKEN = upstream.token;
    process.env.ALLOW_INSECURE_TRANSPORT = 'true';
    appPool = new Pool({ connectionString: scratch.appUrl });
    appPool.on('error', () => {});

    const transport: MailTransport = {
      send: (message) => {
        sent.push({ to: message.to, html: message.html });
        return Promise.resolve({ relayResponse: '250 OK' });
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ARCHIVE_STORE)
      .useValue(fakeArchiveStore())
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(transport)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    await app.listen(0);

    const accounts = new ReviewerAccounts(drizzle(appPool), systemClock);
    const seeded = await accounts.seed({
      username: 'rerunner',
      displayName: 'Rerun Reviewer',
      email: 'rerunner@example.go.th',
    });
    // The two-Reviewer floor is not under test here.
    await accounts.seed({
      username: 'other',
      displayName: 'Other Reviewer',
      email: 'other@example.go.th',
    });
    await q(
      `UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false`,
    );
    reviewerId = seeded.reviewerId;
    browser = new Browser(app.getHttpServer());
    await browser.get('/api/reviewer/session');
    const res = await browser.post('/api/reviewer/sign-in', {
      username: 'rerunner',
      password: seeded.password,
      code: phoneCode(seeded.totpSecret, Date.now()),
    });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    process.env.APP_DATABASE_URL = original.dbUrl;
    process.env.UPSTREAM_BASE_URL = original.baseUrl;
    process.env.UPSTREAM_TOKEN = original.token;
    process.env.ALLOW_INSECURE_TRANSPORT = original.insecure;
    await upstream.close();
    await scratch.drop();
  });

  beforeEach(() => {
    upstream.setFault(null);
  });

  describe('Re-run', () => {
    it('is not a new Decision: approved once, extracted twice, carrying the original Decision id', async () => {
      const id = await approvedAndExtracted();
      const res = await rerun(id);
      expect(res.status).toBe(200);
      await settled(id, 2);

      const [decision] = await eventsOf(id, 'approved');
      expect(await eventsOf(id, 'approved')).toHaveLength(1);
      const queued = await eventsOf(id, 'extraction_rerun_queued');
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        actor_type: 'reviewer',
        reviewer_id: reviewerId,
        payload: { originalDecisionEventId: Number(decision.id) },
      });
      expect(await eventsOf(id, 'job_completed')).toHaveLength(2);
    }, 45_000);

    it('makes a fresh Extract under the next -rN name, a fresh token and a fresh 72 hours, and never calls the Probe', async () => {
      const id = await approvedAndExtracted();
      upstream.requests.length = 0;
      await rerun(id);
      await settled(id, 2);
      await waitFor(async () => (await tokensOf(id)).length === 2);

      const [first, second] = await tokensOf(id);
      expect(first.archive_filename).toMatch(
        /^dds-envocc-sharing-\d{8}-\d{6}\.zip$/,
      );
      expect(second.archive_filename).toBe(
        first.archive_filename.replace('.zip', '-r2.zip'),
      );
      expect(second.expires_at.getTime() - second.created_at.getTime()).toBe(
        72 * 60 * 60 * 1000,
      );
      expect(second.created_at.getTime()).toBeGreaterThan(
        first.created_at.getTime(),
      );
      // The Probe is the only `page_size=20` call (§5.4).
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(
        upstream.requests.filter((r) => r.query.page_size === '20'),
      ).toEqual([]);
    }, 45_000);

    it('revokes the previous token when the new Extract is ready, as the system, naming the Re-run', async () => {
      const id = await approvedAndExtracted();
      const [original] = await tokensOf(id);
      await rerun(id);
      // At the press nothing is revoked: the original is still collectable.
      expect((await tokensOf(id))[0].revoked_at).toBeNull();

      await settled(id, 2);
      await waitFor(
        async () => (await eventsOf(id, 'download_token_revoked')).length === 1,
      );
      const [first, second] = await tokensOf(id);
      expect(first.id).toBe(original.id);
      expect(first.revoked_at).not.toBeNull();
      expect(second.revoked_at).toBeNull();
      const [queued] = await eventsOf(id, 'extraction_rerun_queued');
      const [revoked] = await eventsOf(id, 'download_token_revoked');
      expect(revoked).toMatchObject({
        actor_type: 'system',
        reviewer_id: null,
        payload: { supersededByEventId: Number(queued.id) },
      });
    }, 45_000);

    it('leaves the original token live and collectable when the Re-run fails', async () => {
      const id = await approvedAndExtracted();
      upstream.setFault({ kind: 'server-error', page: 1, times: 99 });
      await rerun(id);
      await settled(id, 2);
      expect((await jobsOf(id)).map((j) => j.status)).toEqual([
        'succeeded',
        'failed',
      ]);
      const tokens = await tokensOf(id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].revoked_at).toBeNull();
      expect(await eventsOf(id, 'download_token_revoked')).toEqual([]);
    }, 45_000);

    it('refuses a second Re-run while one is extracting', async () => {
      const id = await approvedAndExtracted();
      upstream.setFault({
        kind: 'slow-page',
        page: 1,
        delayMs: 1_500,
        times: 1,
      });
      expect((await rerun(id)).status).toBe(200);
      const second = await rerun(id);
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: 'extracting' });
      await settled(id, 2);
    }, 45_000);

    it('refuses any field in the body', async () => {
      const id = await approvedAndExtracted();
      expect((await rerun(id, { reportCodes: ['201'] })).status).toBe(400);
      expect(await jobsOf(id)).toHaveLength(1);
    }, 45_000);
  });

  describe('resend (§10.8, ADR 0017)', () => {
    const resend = (id: string, body: unknown = {}) =>
      browser.post(`/api/reviewer/requests/${id}/resend`, body);
    const deliveriesTo = (id: string) =>
      q(
        `SELECT payload FROM request_event WHERE request_id = $1
         AND type = 'mail_sent' AND payload->>'kind' = 'delivery' ORDER BY id`,
        [id],
      );
    const linkIn = (html: string) => /\/d\/([A-Za-z0-9_-]+)/.exec(html)![1];
    const sentTo = (address: string) => sent.filter((m) => m.to === address);
    const addressOf = async (id: string) =>
      (
        await q('SELECT email FROM request_contact WHERE request_id = $1', [id])
      )[0].email as string;

    async function delivered(): Promise<string> {
      const id = await approvedAndExtracted();
      await waitFor(async () => (await deliveriesTo(id)).length === 1);
      return id;
    }

    it('sends the same link to the same address again, audited, and never moves the 72 hours', async () => {
      const id = await delivered();
      const [before] = await tokensOf(id);

      const res = await resend(id);
      expect(res.status).toBe(200);
      await waitFor(async () => (await deliveriesTo(id)).length === 2);

      const address = await addressOf(id);
      const [first, again] = sentTo(address);
      expect(again.html).toBe(first.html);
      const tokens = await tokensOf(id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].expires_at).toEqual(before.expires_at);
      expect((await deliveriesTo(id))[1].payload).toMatchObject({
        kind: 'delivery',
        to: address,
      });
    }, 45_000);

    it('never returns the link it sends', async () => {
      const id = await delivered();
      const [message] = sentTo(await addressOf(id));
      const res = await resend(id);
      expect(JSON.stringify(res.body)).not.toContain(linkIn(message.html));
    }, 45_000);

    it.each([{ email: 'someone.else@example.com' }, { to: 'x@example.com' }])(
      'accepts no address, or any other field: %o',
      async (body) => {
        const id = await delivered();
        const res = await resend(id, body);
        expect(res.status).toBe(400);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(await deliveriesTo(id)).toHaveLength(1);
        expect(sent.some((m) => m.to === body.email || m.to === body.to)).toBe(
          false,
        );
      },
      45_000,
    );

    it('after a Re-run, resends the new link, never the superseded one', async () => {
      const id = await delivered();
      await rerun(id);
      await settled(id, 2);
      await waitFor(async () => (await deliveriesTo(id)).length === 2);

      expect((await resend(id)).status).toBe(200);
      await waitFor(async () => (await deliveriesTo(id)).length === 3);
      const [, fresh, resent] = sentTo(await addressOf(id));
      expect(resent.html).toBe(fresh.html);
    }, 45_000);

    it('is refused on a failed extraction: there is no Delivery to resend', async () => {
      upstream.setFault({ kind: 'server-error', page: 1, times: 99 });
      const id = await approvedAndExtracted();
      const res = await resend(id);
      expect(res.status).toBe(409);
    }, 45_000);
  });

  describe('Re-run over an extraction failure (ADR 0014)', () => {
    async function failedWithAlert(): Promise<string> {
      upstream.setFault({ kind: 'server-error', page: 1, times: 99 });
      const id = await approvedAndExtracted();
      await waitFor(
        async () =>
          (await eventsOf(id, 'extraction_alert_raised')).length === 1,
      );
      upstream.setFault(null);
      return id;
    }
    const alertOf = async (id: string) =>
      ((await browser.get('/api/reviewer/queue')).body.alerts as any[]).find(
        (a) => a.requestId === id,
      );

    it('defers the Alert at the press, and a completed Re-run clears it as the system with re_ran', async () => {
      const id = await failedWithAlert();
      upstream.setFault({
        kind: 'slow-page',
        page: 1,
        delayMs: 1_000,
        times: 1,
      });
      await rerun(id);
      expect(await alertOf(id)).toMatchObject({
        kind: 'extraction_failure',
        deferred: true,
        rerunAttempts: 1,
      });

      await settled(id, 2);
      await waitFor(
        async () =>
          (await eventsOf(id, 'extraction_alert_cleared')).length === 1,
      );
      const [cleared] = await eventsOf(id, 'extraction_alert_cleared');
      expect(cleared).toMatchObject({
        actor_type: 'system',
        reviewer_id: null,
        payload: {
          outcome: 're_ran',
          assignedReviewerId: reviewerId,
          clearingReviewerId: null,
          rerunAttempts: 1,
        },
      });
      expect(await alertOf(id)).toBeUndefined();
    }, 45_000);

    it('leaves a failed Re-run open with a second attempt recorded, and raises no second Alert', async () => {
      const id = await failedWithAlert();
      upstream.setFault({ kind: 'server-error', page: 1, times: 99 });
      await rerun(id);
      await settled(id, 2);
      await waitFor(
        async () => (await eventsOf(id, 'job_failed')).length === 2,
      );

      expect(await alertOf(id)).toMatchObject({
        deferred: false,
        rerunAttempts: 1,
      });
      expect(await eventsOf(id, 'extraction_alert_raised')).toHaveLength(1);
      expect(await eventsOf(id, 'extraction_alert_cleared')).toEqual([]);
    }, 45_000);
  });
});
