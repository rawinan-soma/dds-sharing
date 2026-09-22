/* eslint-disable @typescript-eslint/unbound-method --
   vi.fn() mocks are fine to reference detached; they never read `this`. */
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { reconcileExtractionJobs } from './extraction-reconcile';
import { type ExtractionJobs } from './extraction-jobs.repository';
import { type ExtractionQueue } from './extraction-queue';

const silentLogger = new Logger('test');

function fakeJobs(rows: { id: string; requestId: string }[]): ExtractionJobs {
  return {
    unfinished: vi.fn().mockResolvedValue(rows),
  } as unknown as ExtractionJobs;
}

function fakeQueue(
  reenqueueIfNotLive: (id: string, requestId: string) => Promise<boolean>,
) {
  return {
    reenqueueIfNotLive: vi.fn(reenqueueIfNotLive),
  } as unknown as ExtractionQueue;
}

describe('reconcileExtractionJobs', () => {
  it('re-enqueues a Postgres row with no live BullMQ job', async () => {
    const jobs = fakeJobs([{ id: 'job-1', requestId: 'req-1' }]);
    const queue = fakeQueue(() => Promise.resolve(true));

    const count = await reconcileExtractionJobs(jobs, queue, silentLogger);

    expect(queue.reenqueueIfNotLive).toHaveBeenCalledWith('job-1', 'req-1');
    expect(count).toBe(1);
  });

  it('leaves a job with a live BullMQ job untouched', async () => {
    const jobs = fakeJobs([{ id: 'job-1', requestId: 'req-1' }]);
    const queue = fakeQueue(() => Promise.resolve(false));

    const count = await reconcileExtractionJobs(jobs, queue, silentLogger);

    expect(count).toBe(0);
  });

  it('only ever asks about rows `unfinished()` returned — never touches `pending`, which is not a state this table has', async () => {
    // `unfinished()` is itself the boundary: it selects `queued`/`running`
    // only (see extraction-jobs.repository.ts). An empty result means
    // nothing to reconcile, and the queue is never even asked.
    const jobs = fakeJobs([]);
    const queue = fakeQueue(() => Promise.resolve(true));

    const count = await reconcileExtractionJobs(jobs, queue, silentLogger);

    expect(queue.reenqueueIfNotLive).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });
});
