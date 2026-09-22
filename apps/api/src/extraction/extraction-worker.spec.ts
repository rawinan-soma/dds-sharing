/* eslint-disable @typescript-eslint/unbound-method --
   vi.fn() mocks are fine to reference detached; they never read `this`. */
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, type LoggerService } from '@nestjs/common';
import { DelayedError } from 'bullmq';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { type UpstreamPage } from '../upstream/upstream-client';
import { type ArchiveStore } from './archive-store';
import { type UpstreamPager } from './extraction-pipeline';
import { DISK_FLOOR_BYTES } from './extraction.config';
import { type ExtractionJobs } from './extraction-jobs.repository';
import {
  type ExtractionJobLike,
  type ExtractionWorkerDeps,
  processExtractionJob,
} from './extraction-worker';

const SCRATCH_DIR = mkdtempSync(join(tmpdir(), 'extraction-worker-'));
afterAll(() => rmSync(SCRATCH_DIR, { recursive: true, force: true }));

// A stand-in for the three drizzle calls this module makes: `select().from()
// .where()` for `loadTarget`'s request row and `loadProbeTotals`'s event row,
// and `insert().values()` (writeRequestEvent). The two selects are told apart
// by the columns asked for — `loadProbeTotals` asks for `payload` alone — not
// by the table or condition, which no other unit spec in this codebase fakes
// either (DB-touching logic is tested against a real scratch database at the
// e2e layer instead), so this stays deliberately minimal: only the shapes
// `extraction-worker.ts` actually calls.
interface Inserted {
  values: { type: string; payload?: Record<string, unknown> };
}

function fakeDb(
  requestRow: Record<string, unknown> | undefined,
  probeRow?: { payload: unknown },
) {
  const inserted: Inserted[] = [];
  const db = {
    select: (shape: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const isProbeQuery =
            Object.keys(shape).length === 1 && 'payload' in shape;
          if (isProbeQuery) {
            return Promise.resolve(probeRow ? [probeRow] : []);
          }
          return Promise.resolve(requestRow ? [requestRow] : []);
        },
      }),
    }),
    insert: () => ({
      values: (values: Inserted['values']) => {
        inserted.push({ values });
        return Promise.resolve();
      },
    }),
  } as unknown as NodePgDatabase;
  return { db, inserted };
}

function fakeJobs(): ExtractionJobs {
  return {
    markRunning: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    markSucceeded: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExtractionJobs;
}

function fakeJob(
  overrides: Partial<ExtractionJobLike> = {},
): ExtractionJobLike & { moveToDelayed: ReturnType<typeof vi.fn> } {
  return {
    id: 'job-1',
    data: { requestId: 'req-1' },
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const REQUEST_ROW = {
  reportCodes: ['999'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  provinces: [],
  submittedAt: new Date('2025-12-31T10:00:00Z'),
};

function fakeArchiveStore(): ArchiveStore & {
  uploads: { objectKey: string; bytes: Buffer }[];
} {
  const uploads: { objectKey: string; bytes: Buffer }[] = [];
  return {
    uploads,
    upload: vi.fn((objectKey: string, bytes: Buffer) => {
      uploads.push({ objectKey, bytes });
      return Promise.resolve();
    }),
  };
}

function noopUpstream(): UpstreamPager {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(): AsyncGenerator<UpstreamPage> {
      yield {
        rows: [],
        meta: {
          page: 1,
          pageSize: 10_000,
          totalItems: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        requestId: null,
        processTimeMs: 1,
      };
    },
  };
}

const silentLogger = new Logger('test') as LoggerService;

function baseDeps(
  overrides: Partial<ExtractionWorkerDeps> = {},
): ExtractionWorkerDeps {
  return {
    db: fakeDb(REQUEST_ROW).db,
    connection: {} as ExtractionWorkerDeps['connection'],
    upstream: noopUpstream(),
    extractionJobs: fakeJobs(),
    provinceLookup: {
      provinces: [],
      checksum: 'fake-province-checksum',
    } as unknown as ExtractionWorkerDeps['provinceLookup'],
    scratchDir: SCRATCH_DIR,
    archiveStore: fakeArchiveStore(),
    freeDiskBytes: () => Promise.resolve(DISK_FLOOR_BYTES * 2),
    now: () => new Date('2026-01-01T00:00:00Z'),
    sleep: () => Promise.resolve(),
    logger: silentLogger,
    ...overrides,
  };
}

describe('processExtractionJob', () => {
  it('defers below the disk floor: writes job_deferred_low_disk and moves the job to delayed, touching no other state', async () => {
    const { db, inserted } = fakeDb(undefined);
    const jobs = fakeJobs();
    const job = fakeJob();

    // The `DelayedError` throw is BullMQ's own required signal that this job
    // was deliberately moved, not a real failure.
    await expect(
      processExtractionJob(
        job,
        'token-1',
        baseDeps({
          db,
          extractionJobs: jobs,
          freeDiskBytes: () => Promise.resolve(DISK_FLOOR_BYTES - 1),
        }),
      ),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({ type: 'job_deferred_low_disk' });
    expect(jobs.markRunning).not.toHaveBeenCalled();
  });

  it('runs to success on the happy path: markRunning, job_started, code_fetched, job_completed, then markSucceeded', async () => {
    const jobs = fakeJobs();
    const { db, inserted } = fakeDb(REQUEST_ROW);
    const archiveStore = fakeArchiveStore();

    await processExtractionJob(
      fakeJob(),
      undefined,
      baseDeps({ db, extractionJobs: jobs, archiveStore }),
    );

    expect(jobs.markRunning).toHaveBeenCalledTimes(1);
    expect(jobs.markSucceeded).toHaveBeenCalledTimes(1);
    expect(jobs.markFailed).not.toHaveBeenCalled();
    expect(inserted.map((i) => i.values.type)).toEqual([
      'job_started',
      'code_fetched',
      'job_completed',
    ]);
  });

  it('uploads the finished archive to MinIO in exactly one operation, then deletes it from scratch', async () => {
    const jobs = fakeJobs();
    const { db } = fakeDb(REQUEST_ROW);
    const archiveStore = fakeArchiveStore();

    await processExtractionJob(
      fakeJob(),
      undefined,
      baseDeps({ db, extractionJobs: jobs, archiveStore }),
    );

    expect(archiveStore.upload).toHaveBeenCalledTimes(1);
    const [objectKey, bytes] = archiveStore.uploads[0]
      ? [archiveStore.uploads[0].objectKey, archiveStore.uploads[0].bytes]
      : [undefined, undefined];
    expect(objectKey).toBe('dds-envocc-sharing-20251231-170000.zip');
    expect(bytes?.length).toBeGreaterThan(0);

    // Nothing left behind in scratch once the upload succeeds (spec §7.8).
    const leftover = await readdir(SCRATCH_DIR);
    expect(leftover).toEqual([]);
  });

  it('writes job_completed with the fingerprint group, the reference-data group, the archive filename and drift, recorded not asserted', async () => {
    const jobs = fakeJobs();
    const { db, inserted } = fakeDb(REQUEST_ROW, {
      payload: {
        reportCodes: ['999'],
        callsMade: 1,
        spanStart: '2025-01-01',
        spanEnd: '2025-02-01',
        totalItemsByCode: { '999': 3 },
        totalItems: 3,
        xRequestIds: [],
      },
    });

    await processExtractionJob(
      fakeJob(),
      undefined,
      baseDeps({ db, extractionJobs: jobs }),
    );

    const completed = inserted.find((i) => i.values.type === 'job_completed');
    const payload = completed?.values.payload;
    expect(payload).toMatchObject({
      rowCount: 0,
      columnCount: 23,
      provincesChecksum: 'fake-province-checksum',
      archiveFilename: 'dds-envocc-sharing-20251231-170000.zip',
      impossibleDerivationInputs: 0,
      drift: {
        probe: { '999': 3 },
        run: { '999': 0 },
      },
    });
    expect(payload?.csvSha256 as string).toMatch(/^[0-9a-f]{64}$/);
    expect(payload?.dataDictionaryChecksum as string).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload?.csvBytes).toBe('number');
    expect(typeof payload?.zipBytes).toBe('number');
  });

  it('records an empty Probe side of the drift when no Probe ever landed', async () => {
    const jobs = fakeJobs();
    const { db, inserted } = fakeDb(REQUEST_ROW);

    await processExtractionJob(
      fakeJob(),
      undefined,
      baseDeps({ db, extractionJobs: jobs }),
    );

    const completed = inserted.find((i) => i.values.type === 'job_completed');
    expect(completed?.values.payload).toMatchObject({
      drift: { probe: {}, run: { '999': 0 } },
    });
  });

  it('rejects, never silently, when the target Request row does not exist', async () => {
    // Not reachable in practice — `extraction_job.request_id` is a foreign
    // key — but a job whose Request has vanished must fail loudly rather
    // than be swallowed, and BullMQ's own retry/failure bookkeeping is what
    // catches a rejection here.
    const jobs = fakeJobs();
    const { db } = fakeDb(undefined);

    await expect(
      processExtractionJob(
        fakeJob(),
        undefined,
        baseDeps({ db, extractionJobs: jobs }),
      ),
    ).rejects.toThrow(/does not exist/);
    expect(jobs.markRunning).not.toHaveBeenCalled();
  });

  it('fails with cause `stall` when no Report code completes in time, and writes job_failed', async () => {
    const jobs = fakeJobs();
    const { db, inserted } = fakeDb(REQUEST_ROW);
    // Never resolves within the job's lifetime — the stall guard alone must
    // be what ends this job.
    const hangingUpstream: UpstreamPager = {
      async *pages(): AsyncGenerator<UpstreamPage> {
        await new Promise<never>(() => undefined);
        yield undefined as never;
      },
    };

    await processExtractionJob(
      fakeJob(),
      undefined,
      baseDeps({
        db,
        extractionJobs: jobs,
        upstream: hangingUpstream,
        stallMs: 5,
      }),
    );

    expect(jobs.markFailed).toHaveBeenCalledWith(
      'job-1',
      expect.any(Date),
      'stall',
      null,
    );
    const failedEvent = inserted.find((i) => i.values.type === 'job_failed');
    expect(failedEvent?.values).toMatchObject({ payload: { cause: 'stall' } });
  });

  it('raises the operational alert and still succeeds for a missing epidem_chw_code', async () => {
    const jobs = fakeJobs();
    const { db } = fakeDb({ ...REQUEST_ROW, reportCodes: ['201'] });
    const upstreamWithMissingCode: UpstreamPager = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *pages(): AsyncGenerator<UpstreamPage> {
        yield {
          rows: [{ epidem_report_guid: 'GUID-1' }],
          meta: {
            page: 1,
            pageSize: 10_000,
            totalItems: 1,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
          requestId: null,
          processTimeMs: 1,
        };
      },
    };
    const warn = vi.fn();
    const logger = { log() {}, warn, error() {} } as unknown as LoggerService;

    await processExtractionJob(
      fakeJob(),
      undefined,
      baseDeps({
        db,
        extractionJobs: jobs,
        upstream: upstreamWithMissingCode,
        logger,
      }),
    );

    expect(jobs.markSucceeded).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('had no epidem_chw_code'),
    );
  });
});
