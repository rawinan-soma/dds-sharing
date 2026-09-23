/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
   rows from pg are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ARCHIVE_STORE } from '../src/extraction/extraction.module';
import { ExtractionQueue } from '../src/extraction/extraction-queue';
import { HealthService } from '../src/health/health.service';
import { MailSender } from '../src/mail/mail-sender';
import { TickScheduler } from '../src/scheduler/scheduler.module';
import { Tick, type PassReport } from '../src/scheduler/tick';
import { fakeArchiveStore } from './support/fake-archive-store';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The tick as main.ts starts it (spec §15.3): `TickScheduler.start()` — the
// startup reconcile, then the one 60-second interval — against the system
// clock, the real mail queue and worker on Redis, and an SMTP relay that
// cannot be reached (.env.test's smtp.test). Only MinIO is faked (nothing in
// CI runs one), and the extraction queue records rather than runs, so no job
// reaches the upstream.
//
// One lifecycle, run once in beforeAll and asserted piece by piece: a process
// starts over work a dead one left, runs a regular pass, is stopped, and a
// second process starts over work added while nothing was running.
describe('starting the tick (e2e)', () => {
  let scratch: ScratchDatabase;
  let archiveStore: ReturnType<typeof fakeArchiveStore>;
  const apps: INestApplication[] = [];
  const reenqueued: string[] = [];
  const originalDbUrl = process.env.APP_DATABASE_URL;

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

  async function until<T>(read: () => Promise<T>, done: (v: T) => boolean) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const value = await read();
      if (done(value)) return value;
      if (Date.now() > deadline) throw new Error('timed out waiting');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ARCHIVE_STORE)
      .useValue(archiveStore)
      .overrideProvider(ExtractionQueue)
      .useValue({
        enqueue: () => Promise.resolve(),
        reenqueueIfNotLive: (jobId: string) => {
          reenqueued.push(jobId);
          return Promise.resolve(true);
        },
        close: () => Promise.resolve(),
      })
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    apps.push(app);
    return app;
  }

  async function insertRequest(state: string, submittedAt: Date) {
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

  /** A collected Request whose token expired yesterday, its object still in the bucket. */
  async function expiredObject(): Promise<{ id: string; objectKey: string }> {
    const now = Date.now();
    const id = await insertRequest('collected', new Date(now - 10 * DAY));
    const objectKey = `${randomUUID()}.zip`;
    await archiveStore.upload(objectKey, Buffer.from('zip'));
    await q(
      `INSERT INTO download_token (request_id, token_hash, archive_filename, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        randomUUID(),
        objectKey,
        new Date(now - 4 * DAY),
        new Date(now - DAY),
      ],
    );
    return { id, objectKey };
  }

  const stateOf = async (id: string) =>
    (await q('SELECT state FROM request WHERE id = $1', [id]))[0].state;
  const beatAt = async () =>
    (await q('SELECT beat_at FROM scheduler_heartbeat'))[0]?.beat_at as
      Date | undefined;
  const mailRow = async (id: string) =>
    (
      await q('SELECT status, attempts FROM mail_delivery WHERE id = $1', [id])
    )[0];
  const sessionCount = async () =>
    Number((await q('SELECT count(*) FROM reviewer_session'))[0].count);
  const objectDeletedFor = async (id: string) =>
    q(
      `SELECT payload FROM request_event WHERE request_id = $1 AND type = 'object_deleted'`,
      [id],
    );

  // What a dead process left behind.
  let pending: string;
  let firstObject: { id: string; objectKey: string };
  let runningJob: string;
  let mailId: string;
  // What the lifecycle produced.
  const seen: Record<string, unknown> = {};
  let regularPass: PassReport | 'skipped';
  // Work added while nothing was running, between the two processes.
  let secondObject: { id: string; objectKey: string };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    archiveStore = fakeArchiveStore();
    const now = Date.now();

    pending = await insertRequest('pending', new Date(now - 30 * DAY));
    firstObject = await expiredObject();
    const approved = await insertRequest('approved', new Date(now - DAY));
    [{ id: runningJob }] = await q(
      `INSERT INTO extraction_job (request_id, status, started_at, last_progress_at)
       VALUES ($1, 'running', now(), now()) RETURNING id`,
      [approved],
    );
    const [{ id: reviewerId }] = await q(
      `INSERT INTO reviewer (username, display_name, email, password_hash, totp_secret, totp_confirmed_at)
       VALUES ('startup.test', 'Reviewer', 'r@example.go.th', 'x', 'x', now()) RETURNING id`,
    );
    await q(
      `INSERT INTO reviewer_session (token_hash, reviewer_id, created_at, last_seen_at)
       VALUES ('idle', $1, $2, $2)`,
      [reviewerId, new Date(now - 2 * HOUR)],
    );

    // First process. A send the relay refuses, made through the real queue
    // and worker, then aged past its 15 minutes so its retry is due.
    const first = await boot();
    await first.get(MailSender).send(approved, 'somchai@example.go.th', {
      kind: 'rejection',
      name: 'Somchai',
      reference: 'REQ-TEST',
    });
    [{ id: mailId }] = await q('SELECT id FROM mail_delivery');
    await until(
      () => mailRow(mailId),
      (row) => row?.status === 'failed',
    );
    await q(
      `UPDATE mail_delivery SET updated_at = now() - interval '16 minutes' WHERE id = $1`,
      [mailId],
    );

    await first.get(TickScheduler).start();
    const registry = first.get(SchedulerRegistry);
    seen.intervals = registry.getIntervals();
    seen.timeouts = registry.getTimeouts();
    seen.cronJobs = registry.getCronJobs().size;
    seen.startupBeat = await beatAt();
    seen.pendingAfterStartup = await stateOf(pending);
    seen.sessionsAfterStartup = await sessionCount();
    seen.mailAfterStartup = await mailRow(mailId);
    seen.reenqueuedAtStartup = [...reenqueued];

    regularPass = await first.get(Tick).runPass();
    seen.regularBeat = await beatAt();
    seen.pendingAfterPass = await stateOf(pending);
    seen.sessionsAfterPass = await sessionCount();
    // The retry the pass started, tried against the unreachable relay.
    seen.mailAfterRetry = await until(
      () => mailRow(mailId),
      (row) => row.status === 'failed' && row.attempts === 2,
    );
    seen.health = (await first.get(HealthService).check()).components.scheduler;

    await first.close();
    apps.length = 0;

    // Nothing running now. Work arrives; a new process must find it cold.
    secondObject = await expiredObject();
    const second = await boot();
    await second.get(TickScheduler).start();
    seen.restartBeat = await beatAt();
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    process.env.APP_DATABASE_URL = originalDbUrl;
    await scratch.drop();
  });

  it('registers one schedule — the tick’s 60-second interval — and no other', () => {
    expect(seen.intervals).toEqual(['tick']);
    expect(seen.timeouts).toEqual([]);
    expect(seen.cronJobs).toBe(0);
  });

  it('runs the startup reconcile first, on unfinished extractions and expired objects', async () => {
    expect(seen.reenqueuedAtStartup).toEqual([runningJob]);
    expect(await archiveStore.stat(firstObject.objectKey)).toBeNull();
    const [event] = await objectDeletedFor(firstObject.id);
    expect(event.payload).toEqual({
      objectKey: firstObject.objectKey,
      outcome: 'deleted',
    });
  });

  it('touches nothing else on startup — never pending, no mail, no pruning', () => {
    expect(seen.pendingAfterStartup).toBe('pending');
    expect(seen.sessionsAfterStartup).toBe(1);
    expect(seen.mailAfterStartup).toEqual({ status: 'failed', attempts: 1 });
  });

  it('leaves the rest to the next regular pass', () => {
    expect(regularPass).not.toBe('skipped');
    expect(seen.pendingAfterPass).toBe('expired');
    expect(seen.sessionsAfterPass).toBe(0);
    expect(regularPass).toMatchObject({ mailRetried: 1 });
  });

  it('needs no email: with the relay unreachable the retry fails, and the pass still beats and reads healthy', () => {
    expect(seen.mailAfterRetry).toEqual({ status: 'failed', attempts: 2 });
    expect(seen.regularBeat).toBeInstanceOf(Date);
    expect((seen.regularBeat as Date) > (seen.startupBeat as Date)).toBe(true);
    expect(seen.health).toEqual({ status: 'ok' });
  });

  it('needs no catch-up after a restart: a new process picks up work added while none ran', async () => {
    expect(await archiveStore.stat(secondObject.objectKey)).toBeNull();
    expect(await objectDeletedFor(secondObject.id)).toHaveLength(1);
    expect((seen.restartBeat as Date) > (seen.regularBeat as Date)).toBe(true);
  });
});
