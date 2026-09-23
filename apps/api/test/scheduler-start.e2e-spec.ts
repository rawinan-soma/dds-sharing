/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
   rows from pg are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ARCHIVE_STORE } from '../src/extraction/extraction.module';
import { HealthService } from '../src/health/health.service';
import { TickScheduler } from '../src/scheduler/scheduler.module';
import { Tick } from '../src/scheduler/tick';
import { fakeArchiveStore } from './support/fake-archive-store';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The tick as main.ts starts it (spec §15.3): `TickScheduler.start()` — the
// startup reconcile, then the one 60-second interval — against the real BullMQ
// queues on Redis, the system clock, and an SMTP relay that cannot be reached
// (.env.test's smtp.test). Only MinIO is faked: nothing in CI runs one.
describe('starting the tick (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let archiveStore: ReturnType<typeof fakeArchiveStore>;
  const originalDbUrl = process.env.APP_DATABASE_URL;

  const q = async (text: string, params: unknown[] = []) =>
    (await scratch.owner.query(text, params)).rows;

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

  const stateOf = async (id: string) =>
    (await q('SELECT state FROM request WHERE id = $1', [id]))[0].state;
  const beatAt = async () =>
    (await q('SELECT beat_at FROM scheduler_heartbeat'))[0]?.beat_at as
      Date | undefined;

  // Outstanding work left behind by a process that died: nothing about it is
  // remembered anywhere but Postgres.
  let pending: string;
  let objectKey: string;
  let finished: string;
  let unsendable: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    archiveStore = fakeArchiveStore();

    const now = Date.now();
    pending = await insertRequest('pending', new Date(now - 30 * DAY));
    finished = await insertRequest('collected', new Date(now - 10 * DAY));
    objectKey = `${randomUUID()}.zip`;
    await archiveStore.upload(objectKey, Buffer.from('zip'));
    await q(
      `INSERT INTO download_token (request_id, token_hash, archive_filename, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        finished,
        randomUUID(),
        objectKey,
        new Date(now - 4 * DAY),
        new Date(now - DAY),
      ],
    );
    // A failed send whose retry is due, and whose job no Redis holds.
    const [mail] = await q(
      `INSERT INTO mail_delivery (request_id, kind, status, attempts, updated_at)
       VALUES ($1, 'rejection', 'failed', 1, $2) RETURNING id`,
      [finished, new Date(now - HOUR)],
    );
    unsendable = mail.id as string;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ARCHIVE_STORE)
      .useValue(archiveStore)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    await app.get(TickScheduler).start();
  });

  afterAll(async () => {
    await app.close();
    process.env.APP_DATABASE_URL = originalDbUrl;
    await scratch.drop();
  });

  it('registers one schedule — the tick’s 60-second interval — and no other', () => {
    const registry = app.get(SchedulerRegistry);
    expect(registry.getIntervals()).toEqual(['tick']);
    expect(registry.getTimeouts()).toEqual([]);
    expect(registry.getCronJobs().size).toBe(0);
  });

  it('runs the startup reconcile first: the expired object goes, with no catch-up state', async () => {
    expect(await archiveStore.stat(objectKey)).toBeNull();
    const [event] = await q(
      `SELECT payload FROM request_event
       WHERE request_id = $1 AND type = 'object_deleted'`,
      [finished],
    );
    expect(event.payload).toEqual({ objectKey, outcome: 'deleted' });
  });

  it('never touches pending on startup, and leaves it to the next pass', async () => {
    expect(await stateOf(pending)).toBe('pending');

    await app.get(Tick).runPass();

    expect(await stateOf(pending)).toBe('expired');
  });

  it('beats and reports healthy with the mail relay unreachable: no job needs email', async () => {
    expect(await beatAt()).toBeInstanceOf(Date);
    const health = await app.get(HealthService).check();
    expect(health.components.scheduler).toEqual({ status: 'ok' });

    // The unsendable failed send was dealt with on the regular pass above —
    // abandoned, because Redis never held its job — without stopping anything.
    const [mail] = await q('SELECT status FROM mail_delivery WHERE id = $1', [
      unsendable,
    ]);
    expect(mail.status).toBe('abandoned');
  });

  it('stops the interval when the app shuts down', () => {
    const registry = app.get(SchedulerRegistry);
    app.get(TickScheduler).onApplicationShutdown();
    expect(registry.getIntervals()).toEqual([]);
  });
});
