/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument --
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

// The five contact fields, as every Request here carries them. None may reach
// the lookup of a terminal Request (ADR 0015) — `workplace` only by way of
// the Snapshot, which spells it differently so the two cannot be confused.
const CONTACT = {
  name: 'Somchai',
  surname: 'Jaidee',
  tel: '081 234 5678',
  email: 'somchai@example.go.th',
  workplace: 'Live Contact Office',
};
const SNAPSHOT = {
  diseaseGroupName: 'โรคซิลิโคสิส',
  reportCodes: ['202'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  provinces: [],
  probeRowCount: 129,
  workplace: 'Snapshot Office',
};

// Looking up a Request by its exact reference (spec §10.10), against a real
// database: a Request still on the surface is pointed at its zone, and a
// terminal one is read out as a record.
describe('looking up a Request by its reference (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let appPool: Pool;
  let server: App;
  const reviewers: Record<string, { id: string; browser: Browser }> = {};
  // Tuesday 10:00 ICT.
  const clock = new TestClock(ict('2026-09-22T10:00').getTime());
  const originalUrl = process.env.APP_DATABASE_URL;

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

  /** A Request in `state`, submitted Monday 09:00 ICT, with its contact. */
  async function submitted(
    state: string,
  ): Promise<{ id: string; reference: string }> {
    const reference = `REQ-2569-${randomUUID().slice(0, 4).toUpperCase()}`;
    const [row] = await q(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, $2, $3, 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', '{202}', '{}') RETURNING id`,
      [reference, state, ict('2026-09-21T09:00')],
    );
    await q(
      `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        row.id,
        CONTACT.name,
        CONTACT.surname,
        CONTACT.tel,
        CONTACT.email,
        CONTACT.workplace,
      ],
    );
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, ip, user_agent,
         occurred_at, payload)
       VALUES ($1, 'submitted', 'requester', '203.0.113.9', 'Firefox', $2, '{}')`,
      [row.id, ict('2026-09-21T09:00')],
    );
    return { id: row.id as string, reference };
  }

  async function decided(
    requestId: string,
    decision: 'approved' | 'rejected',
    by = 'alice',
  ) {
    const payload =
      decision === 'approved'
        ? { snapshot: SNAPSHOT }
        : {
            snapshot: SNAPSHOT,
            internalNote: 'Could not confirm the workplace',
          };
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, reviewer_id,
         occurred_at, payload)
       VALUES ($1, $2, 'reviewer', $3, $4, $5)`,
      [requestId, decision, reviewers[by].id, ict('2026-09-21T09:30'), payload],
    );
  }

  async function job(requestId: string, status: string) {
    await q(`INSERT INTO extraction_job (request_id, status) VALUES ($1, $2)`, [
      requestId,
      status,
    ]);
  }

  async function systemEvent(
    requestId: string,
    type: string,
    payload: Record<string, unknown> = {},
    at = clock.now(),
  ) {
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
       VALUES ($1, $2, 'system', $3, $4)`,
      [requestId, type, at, payload],
    );
  }

  /** A Download token issued at `issued`, with `attempts` successful ones. */
  async function token(
    requestId: string,
    archiveFilename: string,
    issued: Date,
    { attempts = 0, revoked = false } = {},
  ) {
    const [row] = await q(
      `INSERT INTO download_token (request_id, token_hash, archive_filename,
         created_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        requestId,
        hashToken(randomUUID()),
        archiveFilename,
        issued,
        new Date(issued.getTime() + 72 * HOUR),
        revoked ? clock.now() : null,
      ],
    );
    for (let i = 0; i < attempts; i++) {
      await q(
        `INSERT INTO token_lookup (download_token_id, request_id, token_prefix,
           kind, outcome, ip, user_agent, occurred_at)
         VALUES ($1, $2, 'abcdefgh', 'archive', 'success', '203.0.113.9',
                 'Firefox', $3)`,
        [row.id, requestId, issued],
      );
    }
  }

  const lookup = (reference: string, who = 'bob') =>
    reviewers[who].browser.get(
      `/api/reviewer/lookup?reference=${encodeURIComponent(reference)}`,
    );

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
    server = app.getHttpServer() as App;

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

  describe('a Request still on the surface', () => {
    it('points a pending Request at the queue', async () => {
      const { id, reference } = await submitted('pending');
      const res = await lookup(reference);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ zone: 'queue', requestId: id });
    });

    it('points an in-flight Request at the in-flight list', async () => {
      const { id, reference } = await submitted('approved');
      await decided(id, 'approved');
      await job(id, 'running');
      expect((await lookup(reference)).body).toEqual({
        zone: 'in_flight',
        requestId: id,
      });
    });

    it('points a Request with an open Alert at the Alert, not the in-flight list', async () => {
      const { id, reference } = await submitted('approved');
      await decided(id, 'approved');
      await job(id, 'failed');
      await systemEvent(id, 'job_failed', { cause: 'upstream_5xx' });
      await systemEvent(id, 'extraction_alert_raised');
      expect((await lookup(reference)).body).toEqual({
        zone: 'alerts',
        requestId: id,
      });
    });

    it('carries nothing but where it is: the zone reads the Request itself', async () => {
      const { reference } = await submitted('pending');
      const body = JSON.stringify((await lookup(reference)).body);
      for (const value of Object.values(CONTACT)) {
        expect(body).not.toContain(value);
      }
    });
  });

  describe('a terminal Request', () => {
    it('reads out the record: the ask, the Decision, each file and the trail', async () => {
      const { id, reference } = await submitted('collected');
      await decided(id, 'approved', 'alice');
      await job(id, 'failed');
      await job(id, 'succeeded');
      const issued = new Date(clock.now().getTime() - 24 * HOUR);
      await token(id, 'dds-envocc-sharing-20260921-090000-r2.zip', issued, {
        attempts: 2,
      });
      await systemEvent(id, 'job_completed', {}, issued);

      const res = await lookup(reference);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        zone: null,
        record: {
          requestId: id,
          reference,
          state: 'collected',
          submittedAt: ict('2026-09-21T09:00').toISOString(),
          diseaseGroupName: 'โรคซิลิโคสิส',
          reportCodes: ['202'],
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          area: { kind: 'national' },
          decision: {
            outcome: 'approved',
            reviewer: 'Alice Reviewer',
            decidedAt: ict('2026-09-21T09:30').toISOString(),
            workplace: 'Snapshot Office',
            rowCount: 129,
          },
          files: [
            {
              run: 2,
              archiveFilename: 'dds-envocc-sharing-20260921-090000-r2.zip',
              link: 'live',
              expiresAt: new Date(issued.getTime() + 72 * HOUR).toISOString(),
              attempts: 2,
            },
          ],
          events: [
            {
              type: 'job_completed',
              occurredAt: issued.toISOString(),
              actor: 'system',
              reviewer: null,
            },
            {
              type: 'approved',
              occurredAt: ict('2026-09-21T09:30').toISOString(),
              actor: 'reviewer',
              reviewer: 'Alice Reviewer',
            },
            {
              type: 'submitted',
              occurredAt: ict('2026-09-21T09:00').toISOString(),
              actor: 'requester',
              reviewer: null,
            },
          ],
        },
      });
    });

    it('lists every file, newest run first, each with how its link reads now', async () => {
      const { id, reference } = await submitted('expired_uncollected');
      await decided(id, 'approved');
      const first = new Date(clock.now().getTime() - 200 * HOUR);
      const second = new Date(clock.now().getTime() - 100 * HOUR);
      await token(id, 'dds-envocc-sharing-20260921-090000.zip', first, {
        revoked: true,
      });
      await token(id, 'dds-envocc-sharing-20260921-090000-r3.zip', second);

      const { files } = (await lookup(reference)).body.record;
      expect(files).toEqual([
        expect.objectContaining({ run: 3, link: 'expired', attempts: 0 }),
        expect.objectContaining({ run: 1, link: 'revoked', attempts: 0 }),
      ]);
    });

    it('never shows a contact field, however it ended', async () => {
      const collected = await submitted('collected');
      await decided(collected.id, 'approved');
      const rejected = await submitted('rejected');
      await decided(rejected.id, 'rejected');
      const expired = await submitted('expired');
      await systemEvent(expired.id, 'mail_sent', {
        kind: 'queue_notification',
        to: CONTACT.email,
      });
      await systemEvent(expired.id, 'expired');

      for (const { reference } of [collected, rejected, expired]) {
        const res = await lookup(reference);
        expect(res.body.zone).toBeNull();
        const body = JSON.stringify(res.body);
        for (const value of Object.values(CONTACT)) {
          expect(body).not.toContain(value);
        }
      }
    });

    it('reads out the record, contact-free, when the contact row is gone', async () => {
      // ADR 0019: nothing in the service removes one. The lookup must not
      // depend on the row either way, so it is deleted here by hand.
      const { id, reference } = await submitted('rejected');
      await decided(id, 'rejected');
      await q(`DELETE FROM request_contact WHERE request_id = $1`, [id]);

      const res = await lookup(reference);
      expect(res.status).toBe(200);
      expect(res.body.record).toMatchObject({
        reference,
        state: 'rejected',
        decision: { workplace: 'Snapshot Office' },
      });
      expect(Object.keys(res.body.record)).not.toContain('contact');
    });

    it('carries no action: every Reviewer action on what it found is refused, and changes nothing', async () => {
      const { id, reference } = await submitted('collected');
      await decided(id, 'approved');
      await job(id, 'succeeded');
      await token(
        id,
        'dds-envocc-sharing-20260921-090000.zip',
        new Date(clock.now().getTime() - HOUR),
        { attempts: 1 },
      );
      const { requestId } = (await lookup(reference)).body.record;
      const events = async () =>
        (
          await q(
            `SELECT count(*)::int AS n FROM request_event WHERE request_id = $1`,
            [id],
          )
        )[0].n;
      const before = await events();

      const browser = reviewers.bob.browser;
      for (const [path, body] of [
        [`/api/reviewer/queue/${requestId}/approve`, {}],
        [
          `/api/reviewer/queue/${requestId}/reject`,
          { note: 'Could not confirm the workplace' },
        ],
        [`/api/reviewer/requests/${requestId}/rerun`, {}],
        [`/api/reviewer/requests/${requestId}/resend`, {}],
      ] as const) {
        const res = await browser.post(path, body);
        expect(res.status, path).toBe(404);
      }
      const [{ state }] = await q(`SELECT state FROM request WHERE id = $1`, [
        id,
      ]);
      expect(state).toBe('collected');
      expect(await events()).toBe(before);
    });

    it('shows who refused a rejected Request, never the internal note', async () => {
      const { id, reference } = await submitted('rejected');
      await decided(id, 'rejected', 'bob');
      const res = await lookup(reference);
      expect(res.body.record.decision).toMatchObject({
        outcome: 'rejected',
        reviewer: 'Bob Reviewer',
      });
      expect(JSON.stringify(res.body)).not.toContain('Could not confirm');
    });

    it('has no Decision for a Request that expired undecided', async () => {
      const { id, reference } = await submitted('expired');
      await systemEvent(id, 'expired');
      const { record } = (await lookup(reference)).body;
      expect(record.state).toBe('expired');
      expect(record.decision).toBeNull();
      expect(record.files).toEqual([]);
    });

    it('reads a lapsed, never-collected link as ended before the tick has written it', async () => {
      const { id, reference } = await submitted('approved');
      await decided(id, 'approved');
      await job(id, 'succeeded');
      await token(
        id,
        'dds-envocc-sharing-20260921-090000.zip',
        new Date(clock.now().getTime() - 73 * HOUR),
      );
      const res = await lookup(reference);
      expect(res.body.zone).toBeNull();
      expect(res.body.record.state).toBe('expired_uncollected');
    });

    it('points a terminal Request whose Alert is still open at the Alert', async () => {
      const { id, reference } = await submitted('expired_uncollected');
      await decided(id, 'approved');
      await systemEvent(id, 'collection_lapse_raised', {
        wallClockHoursElapsed: 24,
      });
      expect((await lookup(reference)).body).toEqual({
        zone: 'alerts',
        requestId: id,
      });
    });
  });

  describe('exact reference only', () => {
    it('forgives the case and the surrounding spaces', async () => {
      const { id, reference } = await submitted('pending');
      const res = await lookup(`  ${reference.toLowerCase()} `);
      expect(res.body).toEqual({ zone: 'queue', requestId: id });
    });

    it('finds nothing for part of a reference', async () => {
      const { reference } = await submitted('pending');
      expect((await lookup(reference.slice(0, -1))).status).toBe(404);
      expect((await lookup('REQ-2569-%')).status).toBe(404);
    });

    it('finds nothing by name, surname, telephone, email or workplace', async () => {
      await submitted('pending');
      for (const value of Object.values(CONTACT)) {
        const res = await lookup(value);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
      }
    });

    it('finds nothing without a reference', async () => {
      const res = await reviewers.bob.browser.get('/api/reviewer/lookup');
      expect(res.status).toBe(404);
    });

    it('reads no parameter but the reference', async () => {
      const { id, reference } = await submitted('pending');
      for (const query of [
        `name=${CONTACT.name}`,
        `surname=${CONTACT.surname}`,
        `tel=${CONTACT.tel}`,
        `email=${CONTACT.email}`,
        `workplace=${CONTACT.workplace}`,
        `q=${reference}`,
        `id=${reference}`,
        `requestId=${id}`,
      ]) {
        const res = await reviewers.bob.browser.get(
          `/api/reviewer/lookup?${encodeURI(query)}`,
        );
        expect(res.status, query).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
      }
    });
  });

  it('writes no event, of any type', async () => {
    const { id, reference } = await submitted('rejected');
    await decided(id, 'rejected');
    const count = async () =>
      (
        await q(
          `SELECT (SELECT count(*) FROM request_event)::int AS requests,
                  (SELECT count(*) FROM reviewer_event)::int AS reviewers`,
        )
      )[0];
    const before = await count();
    expect((await lookup(reference)).status).toBe(200);
    expect((await lookup('REQ-0000-0000')).status).toBe(404);
    expect(await count()).toEqual(before);
  });

  it('adds no row to any table, found or not', async () => {
    const pending = await submitted('pending');
    const terminal = await submitted('rejected');
    await decided(terminal.id, 'rejected');
    const tables = (
      await q(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      )
    ).map((t) => t.table_name as string);
    expect(tables).toContain('request_event');
    const rows = async () =>
      Object.fromEntries(
        await Promise.all(
          tables.map(async (t) => [
            t,
            (await q(`SELECT count(*)::int AS n FROM "${t}"`))[0].n,
          ]),
        ),
      );

    const before = await rows();
    for (const reference of [
      pending.reference,
      terminal.reference,
      'REQ-0000-0000',
      CONTACT.email,
      '',
    ]) {
      await lookup(reference);
    }
    await new Browser(server).get(
      `/api/reviewer/lookup?reference=${terminal.reference}`,
    );
    expect(await rows()).toEqual(before);
  });

  it('is for signed-in Reviewers only', async () => {
    const { reference } = await submitted('rejected');
    const stranger = new Browser(server);
    const res = await stranger.get(
      `/api/reviewer/lookup?reference=${reference}`,
    );
    expect(res.status).toBe(401);
  });
});
