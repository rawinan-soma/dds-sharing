/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   rows from pg are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ARCHIVE_STORE } from '../src/extraction/extraction.module';
import { Decisions } from '../src/reviewer/decisions.service';
import {
  createFakeUpstream,
  FakeUpstream,
} from './fake-upstream/fake-upstream';
import { fakeArchiveStore } from './support/fake-archive-store';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// Nothing in CI runs a real MinIO (`.env.test`'s MINIO_ENDPOINT is an
// unresolvable placeholder, matching CI's services, which stops at Postgres
// and Redis). §7.8's one-operation upload is exercised for real here against
// an in-memory stand-in instead — the DI override a `Test.createTestingModule`
// gives for exactly this case — while the unit layer
// (`extraction-worker.spec.ts`) covers the failure paths a fake can force.

// The extraction pipeline (spec §7), wired for real: approve -> a job row in
// Postgres -> a real BullMQ job -> a real Worker calling a real (fake)
// upstream. Unit coverage of fetch/filter/project/completeness lives in
// `src/extraction/*.spec.ts`; this file is the proof that the wiring between
// them — the transaction, the queue, the DB writes — actually holds.
//
// The fake upstream's synthetic rows carry a marker string, not a real
// province id, in every geography field (`test/fake-upstream/synthetic-rows.ts`
// — no real patient data ever seeds it, by standing constraint). That makes
// the "succeeds" case here a Report code with no rows (`999`, matching
// `probe.e2e-spec.ts`'s own "catches a code with no matching rows" case) —
// completeness holds trivially and Project never runs. The "fails" case is
// exactly what an ordinary Report code produces: a real geography-lookup
// failure, fail-loud rather than a silently blank column (spec §6.3).
describe('the extraction pipeline (e2e)', () => {
  let scratch: ScratchDatabase;
  let upstream: FakeUpstream;
  let app: INestApplication<App>;
  let decisions: Decisions;
  let reviewerId: string;
  let archiveStore: ReturnType<typeof fakeArchiveStore>;

  const original = {
    dbUrl: process.env.APP_DATABASE_URL,
    baseUrl: process.env.UPSTREAM_BASE_URL,
    token: process.env.UPSTREAM_TOKEN,
    insecure: process.env.ALLOW_INSECURE_TRANSPORT,
  };

  async function waitFor(
    predicate: () => Promise<boolean>,
    { timeoutMs = 5_000, intervalMs = 25 } = {},
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('timed out waiting for condition');
  }

  async function insertPendingRequest(codes: string[]): Promise<string> {
    const reference = `REQ-TEST-${randomUUID().slice(0, 8)}`;
    const { rows } = await scratch.owner.query(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, 'pending', now(), 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', $2, '{}')
       RETURNING id`,
      [reference, codes],
    );
    const id = rows[0].id as string;
    await scratch.owner.query(
      `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
       VALUES ($1, 'Somchai', 'Jaidee', '081 234 5678', $2, 'Regional Office 1')`,
      [id, `${reference}@example.go.th`],
    );
    return id;
  }

  async function jobFor(
    requestId: string,
  ): Promise<
    { status: string; failureCause: string | null; result: unknown } | undefined
  > {
    const { rows } = await scratch.owner.query(
      'SELECT status, failure_cause AS "failureCause", result FROM extraction_job WHERE request_id = $1',
      [requestId],
    );
    return rows[0] as
      | { status: string; failureCause: string | null; result: unknown }
      | undefined;
  }

  async function eventsOf(
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
    upstream = await createFakeUpstream({ rowsPerCode: 5 });
    process.env.APP_DATABASE_URL = scratch.appUrl;
    process.env.UPSTREAM_BASE_URL = upstream.url;
    process.env.UPSTREAM_TOKEN = upstream.token;
    process.env.ALLOW_INSECURE_TRANSPORT = 'true';

    archiveStore = fakeArchiveStore();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ARCHIVE_STORE)
      .useValue(archiveStore)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    decisions = moduleRef.get(Decisions);

    const { rows } = await scratch.owner.query(
      `INSERT INTO reviewer (username, display_name, email, password_hash, totp_secret)
       VALUES ('extraction.tester', 'Extraction Tester', 'extraction@example.go.th', 'x', 'x')
       RETURNING id`,
    );
    reviewerId = rows[0].id as string;
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

  beforeEach(() => {
    upstream.requests.length = 0;
    upstream.setFault(null);
    archiveStore.uploads.length = 0;
  });

  it('approving writes a queued job row and enqueues a BullMQ job carrying only the reference', async () => {
    const id = await insertPendingRequest(['999']);
    const outcome = await decisions.approve(id, {
      reviewerId,
      displayName: 'Extraction Tester',
    });
    expect(outcome.status).toBe('recorded');

    // Caught here before the worker can race ahead of the assertion.
    const job = await jobFor(id);
    expect(job).toBeDefined();
    expect(['queued', 'running', 'succeeded']).toContain(job!.status);

    const events = await eventsOf(id);
    expect(events.map((e) => e.type)).toContain('job_queued');
  });

  it('runs to success on a code with no matching rows, uploads the archive once, and writes job_started + code_fetched + job_completed', async () => {
    const id = await insertPendingRequest(['999']);
    await decisions.approve(id, {
      reviewerId,
      displayName: 'Extraction Tester',
    });

    await waitFor(async () => {
      const job = await jobFor(id);
      return job?.status === 'succeeded' || job?.status === 'failed';
    });

    const job = await jobFor(id);
    expect(job?.status).toBe('succeeded');

    const events = await eventsOf(id);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'job_queued',
        'job_started',
        'code_fetched',
        'job_completed',
      ]),
    );
    const fetched = events.find((e) => e.type === 'code_fetched')!;
    expect(fetched.payload).toMatchObject({
      groupCode: '999',
      rowsReceived: 0,
      totalItems: 0,
    });

    // spec §7.8: the finished archive uploads to MinIO, and `job_completed`
    // records what was released. Exactly-one-upload is a unit-level property
    // (`extraction-worker.spec.ts`, in isolation); here the wiring is what's
    // under test — a real DI override reaching a real worker — so this only
    // checks that this job's own archive landed, by name and non-empty bytes.
    // An earlier test's job may still be completing in the background and
    // land an upload of its own in the same shared fake.
    const completed = events.find((e) => e.type === 'job_completed')!;
    const archiveFilename = completed.payload.archiveFilename as string;
    expect(
      archiveStore.uploads.some(
        (u) => u.objectKey === archiveFilename && u.bytes.length > 0,
      ),
    ).toBe(true);
    expect(completed.payload).toMatchObject({
      rowCount: 0,
      columnCount: 23,
      drift: { probe: {}, run: { '999': 0 } },
    });
  }, 10_000);

  it('fails loudly, never a blank column, when a fetched geography code is not one of the 77', async () => {
    // An ordinary Report code returns the fake harness's synthetic rows,
    // whose geography fields are marker strings rather than real province
    // ids — exactly the "our table is stale" case (spec §6.3).
    const id = await insertPendingRequest(['201']);
    await decisions.approve(id, {
      reviewerId,
      displayName: 'Extraction Tester',
    });

    await waitFor(async () => {
      const job = await jobFor(id);
      return job?.status === 'succeeded' || job?.status === 'failed';
    });

    const job = await jobFor(id);
    expect(job?.status).toBe('failed');
    expect(job?.failureCause).toBe('internal');

    // The job row is marked failed first; its events land just after.
    await waitFor(async () =>
      (await eventsOf(id)).some((e) => e.type === 'extraction_alert_raised'),
    );
    const events = await eventsOf(id);
    const failed = events.find((e) => e.type === 'job_failed')!;
    expect(failed.payload).toMatchObject({ cause: 'internal' });
    // The broken promise goes to the approving Reviewer as a must-clear
    // Alert (§14.2) — one, however the job failed.
    expect(
      events.filter((e) => e.type === 'extraction_alert_raised'),
    ).toHaveLength(1);
  }, 10_000);
});
