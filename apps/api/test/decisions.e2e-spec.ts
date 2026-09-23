/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { INestApplication } from '@nestjs/common';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ExtractionQueue } from '../src/extraction/extraction-queue';
import { CLOCK } from '../src/clock/clock';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import { Browser, TestClock } from './support/browser';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const ict = (local: string) => new Date(`${local}:00+07:00`);

// The Decision (spec §10.3, §10.4): approve or reject, nothing else, against a
// real database and a clock the test moves by hand.
describe('the Decision (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let server: App;
  let appPool: Pool;
  let signedIn: Browser;
  // Monday 12:00 ICT.
  const clock = new TestClock(ict('2026-09-21T12:00').getTime());
  const originalUrl = process.env.APP_DATABASE_URL;

  async function submitted(
    reference: string,
    at: string,
    extra: {
      state?: string;
      provinces?: string[];
      group?: [string, string];
      codes?: string[];
      name?: string;
      workplace?: string;
    } = {},
  ) {
    const [groupId, groupName] = extra.group ?? ['silicosis', 'โรคซิลิโคสิส'];
    const { rows } = await scratch.owner.query(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, $2, $3, $4, $5, '2025-01-01', '2025-01-31', $6, $7) RETURNING id`,
      [
        reference,
        extra.state ?? 'pending',
        ict(at),
        groupId,
        groupName,
        extra.codes ?? ['202', '203'],
        extra.provinces ?? [],
      ],
    );
    await scratch.owner.query(
      `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
       VALUES ($1, $2, 'Jaidee', '081 234 5678', $3, $4)`,
      [
        rows[0].id,
        extra.name ?? 'Somchai',
        `${reference}@example.go.th`,
        extra.workplace ?? 'Regional Office 1',
      ],
    );
    return rows[0].id as string;
  }

  async function stateOf(id: string): Promise<string> {
    const { rows } = await scratch.owner.query(
      'SELECT state FROM request WHERE id = $1',
      [id],
    );
    return rows[0]?.state;
  }

  async function eventsOf(id: string, type?: string) {
    const { rows } = await scratch.owner.query(
      `SELECT * FROM request_event WHERE request_id = $1
       ${type ? 'AND type = $2' : ''} ORDER BY id`,
      type ? [id, type] : [id],
    );
    return rows;
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    delete process.env.REVIEWER_INSECURE_COOKIE;
    appPool = new Pool({ connectionString: scratch.appUrl });
    appPool.on('error', () => {});

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      // The Decision writes the queued job row and enqueues a BullMQ job
      // (spec §7.7) — the extraction pipeline itself is this file's business
      // to trigger, never to run: it has its own tests. A real enqueue here
      // would have the real Worker retry a real (fake) upstream host on
      // every `approve()`, which is both slow and off-topic for this file.
      .overrideProvider(ExtractionQueue)
      .useValue({ enqueue: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    await app.listen(0);
    server = app.getHttpServer() as App;

    const accounts = new ReviewerAccounts(drizzle(appPool), clock);
    const seeded = await accounts.seed({
      username: 'decision.reviewer',
      displayName: 'Decision Reviewer',
      email: 'decision@example.go.th',
    });
    await scratch.owner.query(
      `UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false
       WHERE id = $1`,
      [seeded.reviewerId],
    );
    signedIn = new Browser(server);
    await signedIn.get('/api/reviewer/session');
    const res = await signedIn.post('/api/reviewer/sign-in', {
      username: 'decision.reviewer',
      password: seeded.password,
      code: phoneCode(seeded.totpSecret, clock.now().getTime()),
    });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    process.env.APP_DATABASE_URL = originalUrl;
    await scratch.drop();
  });

  it('is behind authentication: a dead session decides nothing', async () => {
    const id = await submitted('REQ-2569-1001', '2026-09-21T09:00');
    const anonymous = new Browser(server);
    await anonymous.get('/api/reviewer/session'); // picks up a CSRF cookie

    const res = await anonymous.post(`/api/reviewer/queue/${id}/approve`);
    expect(res.status).toBe(401);
    expect(await stateOf(id)).toBe('pending');
    expect(await eventsOf(id, 'approved')).toHaveLength(0);
  });

  it('refuses a state-changing request with no CSRF token', async () => {
    const id = await submitted('REQ-2569-1002', '2026-09-21T09:00');
    const res = await signedIn.post(
      `/api/reviewer/queue/${id}/approve`,
      {},
      { csrf: false },
    );
    expect(res.status).toBe(403);
    expect(await stateOf(id)).toBe('pending');
  });

  describe('approve', () => {
    it('records the Decision, releases the Request, and carries the Snapshot', async () => {
      const id = await submitted('REQ-2569-1010', '2026-09-21T09:00', {
        provinces: ['50'],
        workplace: 'Regional Office 9',
      });

      const res = await signedIn.post(`/api/reviewer/queue/${id}/approve`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        outcome: 'approved',
        decidedAt: clock.now().toISOString(),
      });
      expect(await stateOf(id)).toBe('approved');

      const [event] = await eventsOf(id, 'approved');
      expect(event.actor_type).toBe('reviewer');
      expect(event.payload).toEqual({
        snapshot: {
          diseaseGroupName: 'โรคซิลิโคสิส',
          reportCodes: ['202', '203'],
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          provinces: ['50'],
          probeRowCount: 'pending',
          workplace: 'Regional Office 9',
        },
      });
      // Never the contact fields (§12.3).
      expect(JSON.stringify(event.payload)).not.toContain('081 234 5678');
      expect(JSON.stringify(event.payload)).not.toContain('@example.go.th');
    });

    it('drops the Request off the queue once approved', async () => {
      const id = await submitted('REQ-2569-1011', '2026-09-21T09:00');
      await signedIn.post(`/api/reviewer/queue/${id}/approve`);
      const list = await signedIn.get('/api/reviewer/queue');
      expect(list.body.requests.map((r: { id: string }) => r.id)).not.toContain(
        id,
      );
    });

    it('cannot be approved twice, or approved once rejected', async () => {
      const id = await submitted('REQ-2569-1012', '2026-09-21T09:00');
      await signedIn.post(`/api/reviewer/queue/${id}/approve`);
      const again = await signedIn.post(`/api/reviewer/queue/${id}/approve`);
      expect(again.status).toBe(404);
      expect(again.body).toEqual({ error: 'not_found' });
    });

    it('has nothing for an unknown or malformed id', async () => {
      for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
        const res = await signedIn.post(`/api/reviewer/queue/${id}/approve`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
      }
    });
  });

  describe('reject', () => {
    it('requires a mandatory internal note, never sent to the requester', async () => {
      const id = await submitted('REQ-2569-1020', '2026-09-21T09:00');

      const res = await signedIn.post(`/api/reviewer/queue/${id}/reject`, {
        note: 'Could not verify the workplace by phone.',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        outcome: 'rejected',
        decidedAt: clock.now().toISOString(),
      });
      expect(await stateOf(id)).toBe('rejected');

      const [event] = await eventsOf(id, 'rejected');
      expect(event.payload).toMatchObject({
        internalNote: 'Could not verify the workplace by phone.',
        snapshot: { workplace: 'Regional Office 1' },
      });
    });

    it('refuses a note shorter than 10 characters, and stores nothing', async () => {
      const id = await submitted('REQ-2569-1021', '2026-09-21T09:00');
      const res = await signedIn.post(`/api/reviewer/queue/${id}/reject`, {
        note: 'too short',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_note' });
      expect(await stateOf(id)).toBe('pending');
      expect(await eventsOf(id, 'rejected')).toHaveLength(0);
    });

    it('refuses a missing note', async () => {
      const id = await submitted('REQ-2569-1022', '2026-09-21T09:00');
      const res = await signedIn.post(`/api/reviewer/queue/${id}/reject`, {});
      expect(res.status).toBe(400);
      expect(await stateOf(id)).toBe('pending');
    });
  });

  describe('expiry beats a late Decision (§10.4)', () => {
    it('refuses an approval past 24 business hours and records why', async () => {
      // Submitted the prior Monday: well past 24 business hours by Monday noon.
      const id = await submitted('REQ-2569-1030', '2026-09-14T09:00');
      // The relay accepted the queue notification a minute after submit.
      const notifiedAt = new Date('2026-09-14T09:01:00+07:00');
      await scratch.owner.query(
        `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
         VALUES ($1, 'mail_sent', 'system', $2, $3)`,
        [
          id,
          notifiedAt,
          {
            kind: 'queue_notification',
            to: 'r@example.go.th',
            relayResponse: '250 OK',
          },
        ],
      );

      const res = await signedIn.post(`/api/reviewer/queue/${id}/approve`);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'expired' });
      // Materialising the state is the tick's job (a later slice), not this
      // refusal's: the row stays exactly as it was.
      expect(await stateOf(id)).toBe('pending');

      const [event] = await eventsOf(id, 'expired');
      expect(event.actor_type).toBe('system');
      expect(event.payload).toMatchObject({
        decisionAttemptedAndRefused: true,
        reviewerAccountsActive: 1,
      });
      expect(event.payload.businessHoursElapsed).toBeGreaterThanOrEqual(24);
      // When the Reviewers were told, not when the refusal happened (§11.3).
      expect(event.payload.notifiedAt).toBe(notifiedAt.toISOString());
    });

    it('refuses a late rejection the same way', async () => {
      const id = await submitted('REQ-2569-1031', '2026-09-14T09:00');
      const res = await signedIn.post(`/api/reviewer/queue/${id}/reject`, {
        note: 'Attempting to reject a stale request.',
      });
      expect(res.status).toBe(409);
      expect(await stateOf(id)).toBe('pending');
      expect(await eventsOf(id, 'rejected')).toHaveLength(0);
    });

    it('is not_found, not expired, for a Request already decided long ago', async () => {
      // Old enough that, were the pending guard missing, this would also
      // read as past the 24-business-hour threshold.
      const id = await submitted('REQ-2569-1032', '2026-09-14T09:00', {
        state: 'approved',
      });
      const res = await signedIn.post(`/api/reviewer/queue/${id}/approve`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
      // No spurious `expired` event on a Request nothing is wrong with.
      expect(await eventsOf(id, 'expired')).toHaveLength(0);
    });
  });

  describe('correcting a mistyped note', () => {
    it('writes note_amended citing the corrected event, never editing it', async () => {
      const id = await submitted('REQ-2569-1040', '2026-09-21T09:00');
      await signedIn.post(`/api/reviewer/queue/${id}/reject`, {
        note: 'Original note with a typo in it.',
      });
      const [original] = await eventsOf(id, 'rejected');

      const res = await signedIn.post(
        `/api/reviewer/decisions/${original.id}/amend-note`,
        { note: 'Corrected note text, no typo this time.' },
      );

      expect(res.status).toBe(204);
      const [stillOriginal] = await eventsOf(id, 'rejected');
      expect(stillOriginal.payload.internalNote).toBe(
        'Original note with a typo in it.',
      );
      const [amendment] = await eventsOf(id, 'note_amended');
      expect(amendment.actor_type).toBe('reviewer');
      expect(amendment.payload).toEqual({
        amendsEventId: Number(original.id),
        internalNote: 'Corrected note text, no typo this time.',
      });
    });

    it('refuses a correction shorter than 10 characters', async () => {
      const id = await submitted('REQ-2569-1041', '2026-09-21T09:00');
      await signedIn.post(`/api/reviewer/queue/${id}/reject`, {
        note: 'Original note text goes here.',
      });
      const [original] = await eventsOf(id, 'rejected');

      const res = await signedIn.post(
        `/api/reviewer/decisions/${original.id}/amend-note`,
        { note: 'short' },
      );
      expect(res.status).toBe(422);
      expect(await eventsOf(id, 'note_amended')).toHaveLength(0);
    });

    it('finds nothing for an id that is not a rejected event', async () => {
      const id = await submitted('REQ-2569-1042', '2026-09-21T09:00');
      await signedIn.post(`/api/reviewer/queue/${id}/approve`);
      const [approved] = await eventsOf(id, 'approved');

      const res = await signedIn.post(
        `/api/reviewer/decisions/${approved.id}/amend-note`,
        { note: 'This should not be attachable here.' },
      );
      expect(res.status).toBe(404);
    });
  });
});
