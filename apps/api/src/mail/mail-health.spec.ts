import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { mailHealth } from './mail-health';

function fakeDb(rows: { kind: string }[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
  } as unknown as NodePgDatabase;
}

describe('mailHealth', () => {
  it('is ok with nothing unresolved', async () => {
    expect(await mailHealth(fakeDb([]))).toEqual({ status: 'ok' });
  });

  it('is ok with exactly one unresolved delivery of a non-queue_notification kind', async () => {
    expect(await mailHealth(fakeDb([{ kind: 'delivery' }]))).toEqual({
      status: 'ok',
    });
  });

  it('degrades on the very first failed queue_notification (spec §11.3)', async () => {
    const result = await mailHealth(fakeDb([{ kind: 'queue_notification' }]));
    expect(result.status).toBe('degraded');
  });

  it('degrades when two or more emails of any kind are concurrently unresolved', async () => {
    const result = await mailHealth(
      fakeDb([{ kind: 'delivery' }, { kind: 'rejection' }]),
    );
    expect(result.status).toBe('degraded');
  });

  it('never carries a count in its reason: the health document is statuses only', async () => {
    const result = await mailHealth(
      fakeDb([
        { kind: 'delivery' },
        { kind: 'rejection' },
        { kind: 'delivery' },
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });
});
