/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument --
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

// Alerts on the queue (spec §10.6): must-clear items, cleared only by naming an
// outcome from a closed set, against a real database.
describe('Alerts on the queue (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let server: App;
  let appPool: Pool;
  let accounts: ReviewerAccounts;
  const reviewers: Record<string, { id: string; browser: Browser }> = {};
  // Tuesday 10:00 ICT.
  const clock = new TestClock(ict('2026-09-22T10:00').getTime());
  const originalUrl = process.env.APP_DATABASE_URL;

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

  /** An approved Request, approved by `approver`. */
  async function approved(approver: string): Promise<string> {
    const [row] = await q(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, 'approved', $2, 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', '{202}', '{}') RETURNING id`,
      [`REQ-TEST-${randomUUID().slice(0, 8)}`, ict('2026-09-21T09:00')],
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
       VALUES ($1, 'approved', 'reviewer', $2, $3, '{}')`,
      [row.id, reviewers[approver].id, ict('2026-09-21T09:30')],
    );
    return row.id as string;
  }

  async function systemEvent(
    requestId: string,
    type: string,
    at: string,
    payload: Record<string, unknown> = {},
  ) {
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
       VALUES ($1, $2, 'system', $3, $4)`,
      [requestId, type, ict(at), payload],
    );
  }

  const withLapse = async (approver: string) => {
    const id = await approved(approver);
    await systemEvent(id, 'mail_sent', '2026-09-21T10:00', {
      kind: 'delivery',
    });
    await systemEvent(id, 'collection_lapse_raised', '2026-09-22T10:00', {
      wallClockHoursElapsed: 24,
    });
    return id;
  };
  const withSendAbandoned = async (approver: string) => {
    const id = await approved(approver);
    await systemEvent(id, 'mail_send_abandoned', '2026-09-21T11:00');
    await systemEvent(id, 'delivery_alert_raised', '2026-09-21T11:00');
    return id;
  };
  const withExtractionFailure = async (approver: string) => {
    const id = await approved(approver);
    await systemEvent(id, 'job_failed', '2026-09-21T10:00', {
      cause: 'upstream_5xx',
      xRequestId: null,
    });
    await systemEvent(id, 'extraction_alert_raised', '2026-09-21T10:00');
    return id;
  };

  async function eventsOf(id: string, type?: string) {
    return q(
      `SELECT * FROM request_event WHERE request_id = $1
       ${type ? 'AND type = $2' : ''} ORDER BY id`,
      type ? [id, type] : [id],
    );
  }
  const stateOf = async (id: string) =>
    (await q('SELECT state FROM request WHERE id = $1', [id]))[0].state;

  const clear = (who: string, id: string, body: unknown) =>
    reviewers[who].browser.post(`/api/reviewer/alerts/${id}/clear`, body);
  const alertsSeenBy = async (who: string) =>
    (await reviewers[who].browser.get('/api/reviewer/queue')).body.alerts;

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

    // Three, so deactivating one leaves the two-Reviewer floor intact.
    accounts = new ReviewerAccounts(drizzle(appPool), clock);
    for (const name of ['alice', 'bob', 'carol']) {
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

  describe('on the queue', () => {
    it('lists each of the three kinds as a must-clear item naming its assignee', async () => {
      const lapse = await withLapse('alice');
      const send = await withSendAbandoned('alice');
      const failure = await withExtractionFailure('alice');

      const byId = (alerts: any[]) =>
        new Map(alerts.map((a) => [a.requestId, a]));
      const seenByBob = byId(await alertsSeenBy('bob'));
      const seenByAlice = byId(await alertsSeenBy('alice'));

      expect(seenByAlice.get(lapse)).toMatchObject({
        kind: 'collection_lapse',
        requesterName: 'Somchai Jaidee',
        assignedTo: { displayName: 'Alice Reviewer', active: true },
        outcomes: [
          'reached_requester',
          'could_not_reach_requester',
          'no_action_needed',
        ],
        clearable: true,
        deferred: false,
      });
      expect(seenByAlice.get(send)).toMatchObject({
        kind: 'send_abandoned',
        clearable: true,
      });
      expect(seenByAlice.get(failure)).toMatchObject({
        kind: 'extraction_failure',
        outcomes: ['contacted_requester', 'abandoned'],
      });
      // By name: another Reviewer sees it, and cannot clear it.
      expect(seenByBob.get(lapse)).toMatchObject({ clearable: false });
      expect(seenByBob.get(send)).toMatchObject({ clearable: false });
      expect(seenByBob.get(failure)).toMatchObject({ clearable: true });
    });

    it('lists nothing for an abandoned Probe', async () => {
      const id = await approved('alice');
      await systemEvent(id, 'probe_failed', '2026-09-21T09:10', {
        groupCode: '202',
        errors: [],
      });
      expect(
        (await alertsSeenBy('alice')).map((a: any) => a.requestId),
      ).not.toContain(id);
    });
  });

  describe('clearing a collection lapse', () => {
    it('by the approving Reviewer, naming both Reviewers, back to in flight', async () => {
      const id = await withLapse('alice');

      const res = await clear('alice', id, {
        kind: 'collection_lapse',
        outcome: 'could_not_reach_requester',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        clearedAt: clock.now().toISOString(),
        zone: 'in_flight',
      });
      const [event] = await eventsOf(id, 'collection_lapse_cleared');
      expect(event.actor_type).toBe('reviewer');
      expect(event.reviewer_id).toBe(reviewers.alice.id);
      expect(event.payload).toEqual({
        outcome: 'could_not_reach_requester',
        assignedReviewerId: reviewers.alice.id,
        clearingReviewerId: reviewers.alice.id,
      });
      expect(
        (await alertsSeenBy('alice')).map((a: any) => a.requestId),
      ).not.toContain(id);
    });

    it('is refused to any other active Reviewer', async () => {
      const id = await withLapse('alice');
      const res = await clear('bob', id, {
        kind: 'collection_lapse',
        outcome: 'reached_requester',
      });
      expect(res.status).toBe(403);
      expect(await eventsOf(id, 'collection_lapse_cleared')).toHaveLength(0);
    });
  });

  describe('the closed set: no free text on any clear path', () => {
    it.each([
      ['an outcome from another kind', { outcome: 'abandoned' }],
      ['the system’s re_ran', { outcome: 're_ran' }],
      ['free text', { outcome: 'I rang and left a message' }],
      [
        'a note beside a valid outcome',
        { outcome: 'reached_requester', note: 'x' },
      ],
      ['no outcome', {}],
    ])('refuses %s', async (_label, extra) => {
      const id = await withLapse('alice');
      const res = await clear('alice', id, {
        kind: 'collection_lapse',
        ...extra,
      });
      expect(res.status).toBe(400);
      expect(await eventsOf(id, 'collection_lapse_cleared')).toHaveLength(0);
    });

    it('refuses re_ran on an extraction failure too (ADR 0014)', async () => {
      const id = await withExtractionFailure('alice');
      const res = await clear('alice', id, {
        kind: 'extraction_failure',
        outcome: 're_ran',
      });
      expect(res.status).toBe(400);
    });

    it('answers 404 for an Alert that is not open', async () => {
      const id = await approved('alice');
      const res = await clear('alice', id, {
        kind: 'collection_lapse',
        outcome: 'reached_requester',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('clearing an extraction failure', () => {
    it('by any active Reviewer, recording the clearing one separately', async () => {
      const id = await withExtractionFailure('alice');

      const res = await clear('bob', id, {
        kind: 'extraction_failure',
        outcome: 'contacted_requester',
      });

      expect(res.status).toBe(200);
      expect(res.body.zone).toBe('in_flight');
      const [event] = await eventsOf(id, 'extraction_alert_cleared');
      expect(event.reviewer_id).toBe(reviewers.bob.id);
      expect(event.payload).toEqual({
        outcome: 'contacted_requester',
        assignedReviewerId: reviewers.alice.id,
        clearingReviewerId: reviewers.bob.id,
        rerunAttempts: 0,
      });
      expect(await stateOf(id)).toBe('approved');
    });

    it('as abandoned ends the Request and drops it from the surface', async () => {
      const id = await withExtractionFailure('alice');
      const res = await clear('alice', id, {
        kind: 'extraction_failure',
        outcome: 'abandoned',
      });
      expect(res.status).toBe(200);
      expect(res.body.zone).toBeNull();
      expect(await stateOf(id)).toBe('abandoned');
    });

    it('stays open, deferred and uncleared, while a Re-run is under way', async () => {
      const id = await withExtractionFailure('alice');
      await q(
        `INSERT INTO request_event (request_id, type, actor_type, reviewer_id,
           occurred_at, payload)
         VALUES ($1, 'extraction_rerun_queued', 'reviewer', $2, $3,
                 '{"originalDecisionEventId": 1}')`,
        [id, reviewers.alice.id, ict('2026-09-22T09:00')],
      );

      const listed = (await alertsSeenBy('alice')).find(
        (a: any) => a.requestId === id,
      );
      expect(listed).toMatchObject({ deferred: true, rerunAttempts: 1 });
      const res = await clear('alice', id, {
        kind: 'extraction_failure',
        outcome: 'contacted_requester',
      });
      expect(res.status).toBe(409);
      expect(await eventsOf(id, 'extraction_alert_cleared')).toHaveLength(0);
    });
  });

  // Last: it deactivates alice for the rest of the file.
  describe('deactivating the approving Reviewer (ADR 0013)', () => {
    it('is never blocked, writes nothing on the Request, and widens the Alert without rewriting it', async () => {
      const id = await withSendAbandoned('alice');
      const before = await eventsOf(id);

      const outcome = await accounts.deactivate('alice', { force: false });
      expect(outcome.status).toBe('deactivated');
      expect(await eventsOf(id)).toEqual(before);

      const listed = (await alertsSeenBy('bob')).find(
        (a: any) => a.requestId === id,
      );
      expect(listed).toMatchObject({
        assignedTo: { displayName: 'Alice Reviewer', active: false },
        clearable: true,
      });

      const res = await clear('bob', id, {
        kind: 'send_abandoned',
        outcome: 'no_action_needed',
      });
      expect(res.status).toBe(200);
      const [event] = await eventsOf(id, 'collection_lapse_cleared');
      expect(event.payload).toEqual({
        outcome: 'no_action_needed',
        assignedReviewerId: reviewers.alice.id,
        clearingReviewerId: reviewers.bob.id,
      });
    });
  });
});
