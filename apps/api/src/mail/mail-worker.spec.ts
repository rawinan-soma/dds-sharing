/* eslint-disable @typescript-eslint/unbound-method --
   vi.fn() mocks are fine to reference detached; they never read `this`. */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { type MailDeliveries } from './mail-delivery.repository';
import { type MailJobData } from './mail-queue';
import {
  processMailJob,
  type MailJobLike,
  type MailWorkerDeps,
} from './mail-worker';
import { type MailTransport } from './mail-transport';

interface Inserted {
  values: { type: string; payload?: Record<string, unknown> };
}

function fakeDb() {
  const inserted: Inserted[] = [];
  const db = {
    insert: () => ({
      values: (values: Inserted['values']) => {
        inserted.push({ values });
        return Promise.resolve();
      },
    }),
  } as unknown as NodePgDatabase;
  return { db, inserted };
}

// `priorTries` is what Postgres says: the try number is the record's, never
// BullMQ's attempt counter, because the tick — not BullMQ — schedules retries.
function fakeMailDeliveries(priorTries = 0): MailDeliveries {
  return {
    create: vi.fn(),
    attempts: vi.fn().mockResolvedValue(priorTries),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markAbandoned: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailDeliveries;
}

const DATA: MailJobData = {
  mailDeliveryId: 'md-1',
  requestId: 'req-1',
  kind: 'delivery',
  to: 'somchai@example.go.th',
  subject: 'subject',
  html: '<p>html</p>',
};

const JOB: MailJobLike = { data: DATA };

describe('processMailJob', () => {
  it('writes mail_sent and marks the delivery sent on success', async () => {
    const { db, inserted } = fakeDb();
    const mailDeliveries = fakeMailDeliveries();
    const transport: MailTransport = {
      send: vi.fn().mockResolvedValue({ relayResponse: '250 OK' }),
    };
    const deps: MailWorkerDeps = {
      db,
      transport,
      mailDeliveries,
      from: 'noreply@dds.test',
      connection: {} as never,
      now: () => new Date('2026-01-01T00:00:00Z'),
    };

    await processMailJob(JOB, deps);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      type: 'mail_sent',
      payload: { kind: 'delivery', to: DATA.to, relayResponse: '250 OK' },
    });
    expect(mailDeliveries.markSent).toHaveBeenCalledWith(
      'md-1',
      new Date('2026-01-01T00:00:00Z'),
    );
  });

  it('on a non-final failure, writes mail_send_failed, marks the delivery failed, and rethrows so the job waits in the failed set for the tick', async () => {
    const { db, inserted } = fakeDb();
    const mailDeliveries = fakeMailDeliveries(1);
    const transport: MailTransport = {
      send: vi.fn().mockRejectedValue(new Error('relay refused')),
    };
    const deps: MailWorkerDeps = {
      db,
      transport,
      mailDeliveries,
      from: 'noreply@dds.test',
      connection: {} as never,
      now: () => new Date('2026-01-01T00:15:00Z'),
    };

    await expect(processMailJob(JOB, deps)).rejects.toThrow('relay refused');

    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      type: 'mail_send_failed',
      payload: { tryNumber: 2, relayError: 'relay refused' },
    });
    expect(mailDeliveries.markFailed).toHaveBeenCalledWith(
      'md-1',
      2,
      'relay refused',
      new Date('2026-01-01T00:15:00Z'),
    );
    expect(mailDeliveries.markAbandoned).not.toHaveBeenCalled();
  });

  it('on the final failure, writes mail_send_failed and mail_send_abandoned, marks the delivery abandoned, and does not rethrow', async () => {
    const { db, inserted } = fakeDb();
    const mailDeliveries = fakeMailDeliveries(4);
    const transport: MailTransport = {
      send: vi.fn().mockRejectedValue(new Error('still refused')),
    };
    const deps: MailWorkerDeps = {
      db,
      transport,
      mailDeliveries,
      from: 'noreply@dds.test',
      connection: {} as never,
      now: () => new Date('2026-01-01T01:00:00Z'),
    };

    await expect(processMailJob(JOB, deps)).resolves.toBeUndefined();

    expect(inserted.map((e) => e.values.type)).toEqual([
      'mail_send_failed',
      'mail_send_abandoned',
    ]);
    expect(mailDeliveries.markAbandoned).toHaveBeenCalledWith(
      'md-1',
      5,
      'still refused',
      new Date('2026-01-01T01:00:00Z'),
    );
    expect(mailDeliveries.markFailed).not.toHaveBeenCalled();
  });
});
