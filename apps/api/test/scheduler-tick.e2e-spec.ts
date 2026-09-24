/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
   rows from pg are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { AppModule } from '../src/app.module';
import { ARCHIVE_STORE } from '../src/extraction/extraction.module';
import { ExtractionQueue } from '../src/extraction/extraction-queue';
import { HealthService } from '../src/health/health.service';
import { MailQueue } from '../src/mail/mail-queue';
import { CLOCK } from '../src/clock/clock';
import { ProvinceLookup } from '../src/reference/province-lookup.service';
import { ReviewQueue } from '../src/reviewer/review-queue.service';
import { DB, PG_POOL } from '../src/db/database.module';
import { ExtractionJobs } from '../src/extraction/extraction-jobs.repository';
import { MailDeliveries } from '../src/mail/mail-delivery.repository';
import { LoginThrottle } from '../src/reviewer/login-throttle';
import { ReviewerSessions } from '../src/reviewer/reviewer-sessions';
import { LOG_RETENTION_MS, logFileName } from '../src/logging/log-files';
import { TICK_LOCK_KEY, Tick, type TickDeps } from '../src/scheduler/tick';
import { fakeArchiveStore } from './support/fake-archive-store';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// 2026-09-21 is a Monday. Instants are written in ICT, as the rules are.
const ict = (local: string) => new Date(`${local}:00+07:00`);
const HOUR = 60 * 60 * 1000;

// The tick (spec §15.3): one pass, one advisory lock, every scheduled job.
describe('the tick (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let tick: Tick;
  let archiveStore: ReturnType<typeof fakeArchiveStore>;
  let now: Date;
  const originalDbUrl = process.env.APP_DATABASE_URL;
  const originalLogDir = process.env.LOG_DIR;
  const logDir = mkdtempSync(join(tmpdir(), 'tick-logs-'));

  // Only BullMQ is faked: Postgres is the truth, and it is real here.
  const reenqueued: string[] = [];
  const liveExtractionJobs = new Set<string>();
  const extractionQueue = {
    enqueue: () => Promise.resolve(),
    reenqueueIfNotLive: (jobId: string) => {
      if (liveExtractionJobs.has(jobId)) return Promise.resolve(false);
      reenqueued.push(jobId);
      return Promise.resolve(true);
    },
    close: () => Promise.resolve(),
  };
  const retried: string[] = [];
  const lostMail = new Set<string>();
  const liveMail = new Set<string>();
  const mailQueue = {
    enqueue: () => Promise.resolve(),
    retry: (id: string) => {
      if (lostMail.has(id)) return Promise.resolve('lost' as const);
      retried.push(id);
      return Promise.resolve('retried' as const);
    },
    isLive: (id: string) => Promise.resolve(liveMail.has(id)),
    close: () => Promise.resolve(),
  };

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

  async function insertRequest(
    state: string,
    submittedAt = ict('2026-09-21T09:00'),
  ): Promise<string> {
    const [row] = await q(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, $2, $3, 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', '{999}', '{}')
       RETURNING id`,
      [`REQ-TEST-${randomUUID().slice(0, 8)}`, state, submittedAt],
    );
    return row.id as string;
  }

  async function insertToken(
    requestId: string,
    createdAt: Date,
    options: { upload?: boolean; revokedAt?: Date } = {},
  ): Promise<{ tokenId: string; objectKey: string }> {
    const objectKey = `${randomUUID()}.zip`;
    if (options.upload ?? true) {
      await archiveStore.upload(objectKey, Buffer.from('zip'));
    }
    const [row] = await q(
      `INSERT INTO download_token (request_id, token_hash, archive_filename,
         created_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        requestId,
        randomUUID(),
        objectKey,
        createdAt,
        new Date(createdAt.getTime() + 72 * HOUR),
        options.revokedAt ?? null,
      ],
    );
    return { tokenId: row.id as string, objectKey };
  }

  async function insertEvent(
    requestId: string,
    type: string,
    occurredAt: Date,
    payload: Record<string, unknown> = {},
  ) {
    await q(
      `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
       VALUES ($1, $2, 'system', $3, $4)`,
      [requestId, type, occurredAt, payload],
    );
  }

  async function recordAttempt(requestId: string, tokenId: string) {
    await q(
      `INSERT INTO token_lookup (download_token_id, request_id, token_prefix,
         kind, outcome, ip, user_agent, occurred_at)
       VALUES ($1, $2, 'abcdefgh', 'archive', 'success', '203.0.113.9', 'test', now())`,
      [tokenId, requestId],
    );
  }

  /** A Request delivered at `deliveredAt`: approved, a token, and the Delivery `mail_sent`. */
  async function delivered(deliveredAt: Date) {
    const id = await insertRequest('approved');
    const token = await insertToken(id, deliveredAt);
    await insertEvent(id, 'mail_sent', deliveredAt, {
      kind: 'delivery',
      to: 'somchai@example.go.th',
      relayResponse: '250 OK',
    });
    return { id, ...token };
  }

  /** What the app's own Tick is built from, for a second Tick with one part swapped. */
  const tickDeps = (): TickDeps => ({
    db: app.get(DB),
    pool: app.get(PG_POOL),
    clock: { now: () => now },
    archiveStore,
    extractionJobs: app.get(ExtractionJobs),
    extractionQueue: extractionQueue as unknown as TickDeps['extractionQueue'],
    mailQueue: mailQueue as unknown as TickDeps['mailQueue'],
    mailDeliveries: app.get(MailDeliveries),
    sessions: app.get(ReviewerSessions),
    loginThrottle: app.get(LoginThrottle),
    logDir,
  });

  const eventsOf = (requestId: string, type: string) =>
    q(
      `SELECT actor_type, occurred_at, payload FROM request_event
       WHERE request_id = $1 AND type = $2 ORDER BY id`,
      [requestId, type],
    );
  const stateOf = async (id: string) =>
    (await q('SELECT state FROM request WHERE id = $1', [id]))[0]
      .state as string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    process.env.LOG_DIR = logDir;
    archiveStore = fakeArchiveStore();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ARCHIVE_STORE)
      .useValue(archiveStore)
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .overrideProvider(ExtractionQueue)
      .useValue(extractionQueue)
      .overrideProvider(MailQueue)
      .useValue(mailQueue)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    tick = app.get(Tick);
  });

  afterAll(async () => {
    await app.close();
    process.env.APP_DATABASE_URL = originalDbUrl;
    process.env.LOG_DIR = originalLogDir;
    await scratch.drop();
    rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    now = ict('2026-09-24T10:00');
    reenqueued.length = 0;
    retried.length = 0;
    liveExtractionJobs.clear();
    lostMail.clear();
    liveMail.clear();
  });

  describe('object deletion at token expiry (§9.5)', () => {
    it('deletes an expired token’s object and writes object_deleted with actor, key, time and outcome', async () => {
      const id = await insertRequest('expired_uncollected');
      const { objectKey } = await insertToken(id, ict('2026-09-21T09:00'));

      await tick.runPass();

      expect(await archiveStore.stat(objectKey)).toBeNull();
      const [event] = await eventsOf(id, 'object_deleted');
      expect(event.actor_type).toBe('system');
      expect(event.occurred_at).toEqual(now);
      expect(event.payload).toEqual({ objectKey, outcome: 'deleted' });
    });

    it('records an object the lifecycle backstop already removed, rather than skipping it', async () => {
      const id = await insertRequest('expired_uncollected');
      const { objectKey } = await insertToken(id, ict('2026-09-21T09:00'), {
        upload: false,
      });

      await tick.runPass();

      const [event] = await eventsOf(id, 'object_deleted');
      expect(event.payload).toEqual({ objectKey, outcome: 'already_absent' });
    });

    it('deletes a superseded token’s object on the next pass, not at its own expiry (ADR 0012)', async () => {
      const id = await insertRequest('approved');
      const { objectKey } = await insertToken(id, ict('2026-09-23T09:00'), {
        revokedAt: ict('2026-09-24T09:00'),
      });

      await tick.runPass();

      expect(await archiveStore.stat(objectKey)).toBeNull();
      const [event] = await eventsOf(id, 'object_deleted');
      expect(event.payload).toEqual({ objectKey, outcome: 'deleted' });
    });

    it('leaves a live token’s object alone and writes the record exactly once', async () => {
      const live = await insertRequest('approved');
      const { objectKey } = await insertToken(live, ict('2026-09-23T09:00'));
      const dead = await insertRequest('expired_uncollected');
      await insertToken(dead, ict('2026-09-20T09:00'));

      await tick.runPass();
      await tick.runPass();

      expect(await archiveStore.stat(objectKey)).not.toBeNull();
      expect(await eventsOf(live, 'object_deleted')).toHaveLength(0);
      expect(await eventsOf(dead, 'object_deleted')).toHaveLength(1);
    });

    it('records a delete it issued as deleted, even when the call failed after removing the object', async () => {
      const id = await insertRequest('expired_uncollected');
      const { objectKey } = await insertToken(id, ict('2026-09-21T09:00'));
      const remove = archiveStore.remove.bind(archiveStore);
      // MinIO removed it, but the answer never came back in time.
      archiveStore.remove = async (key) => {
        await remove(key);
        throw new Error('removal timed out');
      };
      try {
        await tick.runPass();
      } finally {
        archiveStore.remove = remove;
      }
      expect(await eventsOf(id, 'object_deleted')).toHaveLength(0);

      await tick.runPass();

      const [event] = await eventsOf(id, 'object_deleted');
      expect(event.payload).toEqual({ objectKey, outcome: 'deleted' });
    });

    it('raises the banner and the health signal for an object still present an hour past expiry', async () => {
      const id = await insertRequest('expired_uncollected');
      const { objectKey } = await insertToken(id, ict('2026-09-21T09:00'));
      const remove = archiveStore.remove.bind(archiveStore);
      archiveStore.remove = () => Promise.reject(new Error('minio down'));
      try {
        await tick.runPass();
      } finally {
        archiveStore.remove = remove;
      }

      expect(await archiveStore.stat(objectKey)).not.toBeNull();
      expect(await eventsOf(id, 'object_deleted')).toHaveLength(0);
      const health = await app.get(HealthService).check();
      expect(health.components.scheduler.status).toBe('degraded');
      expect((await app.get(ReviewQueue).list()).automaticProcessing).toBe(
        'stopped',
      );

      await tick.runPass();
      expect(
        (await app.get(HealthService).check()).components.scheduler.status,
      ).toBe('ok');
    });
  });

  describe('materialising expired (§15.1)', () => {
    it('moves a pending Request past 24 business hours to expired, dated when the predicate became true', async () => {
      const id = await insertRequest('pending', ict('2026-09-21T09:00'));

      await tick.runPass();

      expect(await stateOf(id)).toBe('expired');
      const [event] = await eventsOf(id, 'expired');
      expect(event.actor_type).toBe('system');
      // 24 business hours from Monday 09:00 is Thursday 09:00.
      expect(event.occurred_at).toEqual(ict('2026-09-24T09:00'));
      expect(event.payload).toMatchObject({
        decisionAttemptedAndRefused: false,
        // No queue notification was ever accepted: nobody was told (§11.3).
        notifiedAt: null,
      });
      expect(event.payload.businessHoursElapsed).toBeGreaterThanOrEqual(24);
    });

    it('records when the Reviewers were told: the queue notification the relay accepted', async () => {
      const id = await insertRequest('pending', ict('2026-09-21T09:00'));
      await insertEvent(id, 'mail_sent', ict('2026-09-21T09:01'), {
        kind: 'queue_notification',
        to: 'r@example.go.th',
        relayResponse: '250 OK',
      });

      await tick.runPass();

      const [event] = await eventsOf(id, 'expired');
      expect(event.payload.notifiedAt).toBe(
        ict('2026-09-21T09:01').toISOString(),
      );
    });

    it('leaves a pending Request inside its window pending', async () => {
      const id = await insertRequest('pending', ict('2026-09-23T09:00'));
      await tick.runPass();
      expect(await stateOf(id)).toBe('pending');
      expect(await eventsOf(id, 'expired')).toHaveLength(0);
    });

    it('does not write a second expired event after a refused Decision already wrote one', async () => {
      const id = await insertRequest('pending', ict('2026-09-21T09:00'));
      await insertEvent(id, 'expired', ict('2026-09-24T09:30'), {
        decisionAttemptedAndRefused: true,
      });

      await tick.runPass();

      expect(await stateOf(id)).toBe('expired');
      expect(await eventsOf(id, 'expired')).toHaveLength(1);
    });
  });

  describe('the startup reconcile (§15.3)', () => {
    async function insertJob(
      requestId: string,
      status: string,
      lastProgressAt: Date,
    ) {
      const [row] = await q(
        `INSERT INTO extraction_job (request_id, status, created_at, started_at, last_progress_at)
         VALUES ($1, $2, $3, $3, $3) RETURNING id`,
        [requestId, status, lastProgressAt],
      );
      return row.id as string;
    }

    it('is the same pass with no lower bound: re-enqueues a running job however fresh, and deletes expired objects', async () => {
      const id = await insertRequest('approved');
      const jobId = await insertJob(id, 'running', now);
      const done = await insertRequest('expired_uncollected');
      const { objectKey } = await insertToken(done, ict('2026-09-20T09:00'));

      await tick.runPass('startup');

      expect(reenqueued).toContain(jobId);
      expect(await archiveStore.stat(objectKey)).toBeNull();
    });

    it('never touches pending, and does nothing else on the pass', async () => {
      const pending = await insertRequest('pending', ict('2026-09-14T09:00'));
      const lapsed = await delivered(ict('2026-09-22T09:00'));

      await tick.runPass('startup');

      expect(await stateOf(pending)).toBe('pending');
      expect(await eventsOf(pending, 'expired')).toHaveLength(0);
      expect(await eventsOf(lapsed.id, 'collection_lapse_raised')).toHaveLength(
        0,
      );
    });

    it('on the regular pass, re-enqueues only a job the queue lost after the stall window', async () => {
      const stalled = await insertJob(
        await insertRequest('approved'),
        'running',
        new Date(now.getTime() - 10 * 60 * 1000),
      );
      const fresh = await insertJob(
        await insertRequest('approved'),
        'running',
        new Date(now.getTime() - 10 * 1000),
      );
      const stalledButLive = await insertJob(
        await insertRequest('approved'),
        'running',
        new Date(now.getTime() - 10 * 60 * 1000),
      );
      liveExtractionJobs.add(stalledButLive);

      await tick.runPass();

      expect(reenqueued).toContain(stalled);
      expect(reenqueued).not.toContain(fresh);
      expect(reenqueued).not.toContain(stalledButLive);
    });
  });

  describe('the collection lapse (§11.4, ADR 0011)', () => {
    it('trips on wall-clock hours and holds the Alert for the next opening', async () => {
      // Friday 15:00: trips Saturday 15:00, raised Monday 08:30.
      const req = await delivered(ict('2026-09-18T15:00'));

      now = ict('2026-09-19T16:00');
      await tick.runPass();
      expect(await eventsOf(req.id, 'collection_lapse_raised')).toHaveLength(0);

      now = ict('2026-09-21T08:31');
      await tick.runPass();
      await tick.runPass();
      const events = await eventsOf(req.id, 'collection_lapse_raised');
      expect(events).toHaveLength(1);
      expect(events[0].actor_type).toBe('system');
      expect(events[0].occurred_at).toEqual(ict('2026-09-21T08:30'));
      expect(events[0].payload).toEqual({ wallClockHoursElapsed: 65.5 });
    });

    it('raises a weekday lapse at 24 wall-clock hours, not 24 business hours', async () => {
      const req = await delivered(ict('2026-09-22T09:00'));
      now = ict('2026-09-23T09:05');
      await tick.runPass();
      const [event] = await eventsOf(req.id, 'collection_lapse_raised');
      expect(event.payload).toEqual({ wallClockHoursElapsed: 24 });
    });

    it('raises nothing when the next opening falls after the token has expired', async () => {
      // Thursday 20:00: trips Friday 20:00, the queue next opens Monday 08:30,
      // but the token died Sunday 20:00 — expired_uncollected says it instead.
      const req = await delivered(ict('2026-09-17T20:00'));
      now = ict('2026-09-21T09:00');
      await tick.runPass();
      expect(await eventsOf(req.id, 'collection_lapse_raised')).toHaveLength(0);
      expect(await stateOf(req.id)).toBe('expired_uncollected');
    });

    it('raises nothing once the Requester has made an Attempt', async () => {
      const req = await delivered(ict('2026-09-22T09:00'));
      await recordAttempt(req.id, req.tokenId);
      now = ict('2026-09-23T10:00');
      await tick.runPass();
      expect(await eventsOf(req.id, 'collection_lapse_raised')).toHaveLength(0);
    });
  });

  describe('expired_uncollected (§11.5)', () => {
    it('ends an uncollected Request in its own terminal state, dated at token expiry', async () => {
      const req = await delivered(ict('2026-09-20T09:00'));

      await tick.runPass();

      expect(await stateOf(req.id)).toBe('expired_uncollected');
      const [event] = await eventsOf(req.id, 'expired_uncollected');
      expect(event.actor_type).toBe('system');
      expect(event.occurred_at).toEqual(ict('2026-09-23T09:00'));
    });

    it('never ends a Request that had an Attempt as expired_uncollected', async () => {
      // The Attempt itself moves a Request to collected (delivery.e2e-spec);
      // this row skips that path, so only the tick's own rule is under test.
      const req = await delivered(ict('2026-09-20T09:00'));
      await recordAttempt(req.id, req.tokenId);

      await tick.runPass();

      expect(await stateOf(req.id)).toBe('approved');
      expect(await eventsOf(req.id, 'expired_uncollected')).toHaveLength(0);
    });
  });

  describe('mail send-retries (§11.3)', () => {
    async function insertMail(
      status: string,
      attempts: number,
      updatedAt: Date,
      kind = 'delivery',
    ): Promise<{ id: string; requestId: string }> {
      const requestId = await insertRequest('approved');
      const [row] = await q(
        `INSERT INTO mail_delivery (request_id, kind, status, attempts, updated_at)
         VALUES ($1, $5, $2, $3, $4) RETURNING id`,
        [requestId, status, attempts, updatedAt, kind],
      );
      return { id: row.id as string, requestId };
    }
    const statusOf = async (id: string) =>
      (await q('SELECT status FROM mail_delivery WHERE id = $1', [id]))[0]
        .status as string;

    it('starts the next try of a failed send once its 15 minutes are up', async () => {
      const due = await insertMail(
        'failed',
        2,
        new Date(now.getTime() - 16 * 60 * 1000),
      );
      const early = await insertMail(
        'failed',
        2,
        new Date(now.getTime() - 5 * 60 * 1000),
      );

      await tick.runPass();

      expect(retried).toEqual([due.id]);
      expect(await statusOf(due.id)).toBe('queued');
      expect(await statusOf(early.id)).toBe('failed');
    });

    it('abandons loudly a send whose job Redis lost, since the message cannot be rebuilt', async () => {
      const lost = await insertMail(
        'failed',
        2,
        new Date(now.getTime() - 16 * 60 * 1000),
      );
      lostMail.add(lost.id);
      const stranded = await insertMail(
        'queued',
        0,
        new Date(now.getTime() - 16 * 60 * 1000),
      );
      const waiting = await insertMail(
        'queued',
        0,
        new Date(now.getTime() - 16 * 60 * 1000),
      );
      liveMail.add(waiting.id);

      await tick.runPass();

      expect(await statusOf(lost.id)).toBe('abandoned');
      expect(
        await eventsOf(lost.requestId, 'mail_send_abandoned'),
      ).toHaveLength(1);
      expect(await statusOf(stranded.id)).toBe('abandoned');
      expect(await statusOf(waiting.id)).toBe('queued');
    });

    it('raises the send-abandoned Alert for a lost Delivery, and none for another kind (§10.6)', async () => {
      const delivery = await insertMail(
        'queued',
        0,
        new Date(now.getTime() - 16 * 60 * 1000),
      );
      const rejection = await insertMail(
        'queued',
        0,
        new Date(now.getTime() - 16 * 60 * 1000),
        'rejection',
      );

      await tick.runPass();

      expect(
        await eventsOf(delivery.requestId, 'delivery_alert_raised'),
      ).toHaveLength(1);
      expect(
        await eventsOf(rejection.requestId, 'mail_send_abandoned'),
      ).toHaveLength(1);
      expect(
        await eventsOf(rejection.requestId, 'delivery_alert_raised'),
      ).toHaveLength(0);
    });
  });

  describe('pruning the two deletable tables (§15.4)', () => {
    async function insertReviewer(): Promise<string> {
      const [row] = await q(
        `INSERT INTO reviewer (username, display_name, email, password_hash, totp_secret, totp_confirmed_at)
         VALUES ($1, 'Reviewer', 'r@example.go.th', 'x', 'x', now()) RETURNING id`,
        [`r${randomUUID().slice(0, 8)}`],
      );
      return row.id as string;
    }

    it('deletes dead sessions, recording each as session_expired, and keeps live ones', async () => {
      const reviewerId = await insertReviewer();
      await q(
        `INSERT INTO reviewer_session (token_hash, reviewer_id, created_at, last_seen_at)
         VALUES ($1, $3, $4, $4), ($2, $3, $5, $5)`,
        [
          'idle-session',
          'live-session',
          reviewerId,
          new Date(now.getTime() - 2 * HOUR),
          new Date(now.getTime() - 10 * 60 * 1000),
        ],
      );

      await tick.runPass();

      const sessions = await q(
        'SELECT token_hash FROM reviewer_session WHERE reviewer_id = $1',
        [reviewerId],
      );
      expect(sessions.map((s) => s.token_hash)).toEqual(['live-session']);
      const events = await q(
        `SELECT type, actor_type, occurred_at FROM reviewer_event
         WHERE reviewer_id = $1`,
        [reviewerId],
      );
      expect(events).toEqual([
        {
          type: 'session_expired',
          actor_type: 'reviewer',
          occurred_at: new Date(now.getTime() - HOUR),
        },
      ]);
    });

    it('deletes decayed login-throttle rows and keeps ones still counting', async () => {
      await q(
        `INSERT INTO login_throttle (key, failures, next_allowed_at, updated_at)
         VALUES ('ip:198.51.100.1', 3, $1, $1), ('ip:198.51.100.2', 3, $2, $2)`,
        [new Date(now.getTime() - 2 * HOUR), new Date(now.getTime() - 60_000)],
      );

      await tick.runPass();

      const keys = await q('SELECT key FROM login_throttle ORDER BY key');
      expect(keys.map((k) => k.key)).toEqual(['ip:198.51.100.2']);
    });
  });

  describe('the heartbeat and the single lock (§15.3)', () => {
    it('writes a heartbeat every pass; stale past five minutes it stops the banner and the health component', async () => {
      await tick.runPass();
      expect(
        (await app.get(HealthService).check()).components.scheduler.status,
      ).toBe('ok');
      expect((await app.get(ReviewQueue).list()).automaticProcessing).toBe(
        'running',
      );

      now = new Date(now.getTime() + 5 * 60 * 1000 + 1000);
      expect(
        (await app.get(HealthService).check()).components.scheduler.status,
      ).toBe('degraded');
      expect((await app.get(ReviewQueue).list()).automaticProcessing).toBe(
        'stopped',
      );
    });

    it('does not beat when a job on the pass failed: a half-alive tick is a stopped one', async () => {
      await tick.runPass();
      const beatAt = async () =>
        (await q('SELECT beat_at FROM scheduler_heartbeat'))[0].beat_at;
      const before = await beatAt();

      const id = await insertRequest('expired_uncollected');
      await insertToken(id, ict('2026-09-21T09:00'));
      const remove = archiveStore.remove.bind(archiveStore);
      archiveStore.remove = () => Promise.reject(new Error('minio down'));
      now = new Date(now.getTime() + 60_000);
      try {
        await tick.runPass();
      } finally {
        archiveStore.remove = remove;
      }
      expect(await beatAt()).toEqual(before);

      await tick.runPass();
      expect(await beatAt()).toEqual(now);
    });

    it('applies the lifecycle backstop once per process, not on every pass', async () => {
      // Applied by the first pass this file ran.
      expect(archiveStore.bucketPreparations).toBe(1);
      await tick.runPass();
      expect(archiveStore.bucketPreparations).toBe(1);
    });

    it('keeps the heartbeat back until the lifecycle backstop is applied, retrying each pass', async () => {
      let attempts = 0;
      const fresh = new Tick({
        ...tickDeps(),
        archiveStore: {
          ...archiveStore,
          prepareBucket: () => {
            attempts += 1;
            return attempts === 1
              ? Promise.reject(new Error('minio unreachable'))
              : Promise.resolve();
          },
        },
      });
      const beatAt = async () =>
        (await q('SELECT beat_at FROM scheduler_heartbeat'))[0].beat_at;
      await tick.runPass();
      const before = await beatAt();

      now = new Date(now.getTime() + 60_000);
      await fresh.runPass();
      expect(await beatAt()).toEqual(before);

      await fresh.runPass();
      expect(await beatAt()).toEqual(now);
      await fresh.runPass();
      expect(attempts).toBe(2);
    });

    it('skips the whole pass while another process holds the advisory lock', async () => {
      const other = new Client({ connectionString: scratch.appUrl });
      await other.connect();
      try {
        await other.query('SELECT pg_advisory_lock($1)', [TICK_LOCK_KEY]);
        const id = await insertRequest('pending', ict('2026-09-14T09:00'));

        expect(await tick.runPass()).toBe('skipped');
        expect(await stateOf(id)).toBe('pending');
      } finally {
        await other.end();
      }
      expect(await tick.runPass()).not.toBe('skipped');
    });
  });

  describe('the role boundary (§12.2, §15.4)', () => {
    // Asked of the catalogue for the role itself, grants through PUBLIC
    // included — not of information_schema, which only shows the asker's own.
    const tablesWhere = async (privilege: string) =>
      (
        await q(
          `SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
             AND has_table_privilege('dds_app', c.oid, $1)
           ORDER BY c.relname`,
          [privilege],
        )
      ).map((r) => r.relname as string);

    it('grants the application role DELETE on exactly the two operational tables', async () => {
      expect(await tablesWhere('DELETE')).toEqual([
        'login_throttle',
        'reviewer_session',
      ]);
    });

    it('leaves every event table insert-only, so each cleanup the tick makes there is an insert', async () => {
      const events = ['request_event', 'reviewer_event', 'token_lookup'];
      for (const privilege of ['UPDATE', 'DELETE', 'TRUNCATE']) {
        const granted = await tablesWhere(privilege);
        expect(granted.filter((t) => events.includes(t))).toEqual([]);
      }
      const columnUpdates = await q(
        `SELECT c.relname FROM pg_class c
         WHERE c.relname = ANY($1) AND has_any_column_privilege('dds_app', c.oid, 'UPDATE')`,
        [events],
      );
      expect(columnUpdates).toEqual([]);
    });
  });

  // The `extraction` and province signals read `extraction_job` (§14.1, §6.3).
  describe('the extraction-job health signals', () => {
    const inserted: string[] = [];

    async function finishedJob(
      status: 'succeeded' | 'failed',
      finishedAt: Date,
      result: unknown = null,
    ): Promise<void> {
      const requestId = await insertRequest('approved');
      const [row] = await q(
        `INSERT INTO extraction_job (request_id, status, created_at, finished_at, result, failure_cause)
         VALUES ($1, $2, $3, $3, $4, $5) RETURNING id`,
        [
          requestId,
          status,
          finishedAt,
          result === null ? null : JSON.stringify(result),
          status === 'failed' ? 'internal' : null,
        ],
      );
      inserted.push(row.id as string);
    }

    afterEach(async () => {
      await q('DELETE FROM extraction_job WHERE id = ANY($1)', [inserted]);
      inserted.length = 0;
    });

    const components = async () =>
      (await app.get(HealthService).check()).components;

    it('reddens `extraction` on two consecutive failures, and a success resets it', async () => {
      await finishedJob('failed', ict('2026-09-21T09:00'));
      expect((await components()).extraction.status).toBe('ok');

      await finishedJob('failed', ict('2026-09-21T10:00'));
      expect((await components()).extraction.status).toBe('degraded');

      await finishedJob('succeeded', ict('2026-09-21T11:00'));
      expect((await components()).extraction.status).toBe('ok');
    });

    it('reddens `scheduler` for a province code the current table does not know, until the table changes', async () => {
      await tick.runPass();
      const checksum = app.get(ProvinceLookup).checksum;

      await finishedJob('failed', ict('2026-09-21T09:00'), {
        unrecognisedProvinceCode: { provincesChecksum: 'an-older-table' },
      });
      expect((await components()).scheduler.status).toBe('ok');

      await finishedJob('failed', ict('2026-09-21T10:00'), {
        unrecognisedProvinceCode: { provincesChecksum: checksum },
      });
      expect((await components()).scheduler.status).toBe('degraded');
      expect((await app.get(ReviewQueue).list()).automaticProcessing).toBe(
        'stopped',
      );
    });
  });

  describe('log expiry (§14.5)', () => {
    afterEach(() => {
      for (const name of readdirSync(logDir)) rmSync(join(logDir, name));
    });

    it('deletes an hour file 72 hours after its first line, and keeps a newer one', async () => {
      const expired = logFileName(new Date(now.getTime() - LOG_RETENTION_MS));
      const kept = logFileName(
        new Date(now.getTime() - LOG_RETENTION_MS + HOUR),
      );
      writeFileSync(join(logDir, expired), 'line\n');
      writeFileSync(join(logDir, kept), 'line\n');

      await tick.runPass();

      expect(readdirSync(logDir)).toEqual([kept]);
    });
  });
});
