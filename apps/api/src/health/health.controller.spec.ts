import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { InsecureFlagName, InsecureFlags } from '../config/insecure-flags';
import { DB } from '../db/database.module';
import { mailDelivery, schedulerHeartbeat } from '../db/schema';
import { CLOCK } from '../clock/clock';
import { HealthController } from './health.controller';
import { HEALTH_COMPONENT_NAMES, HealthService } from './health.service';

const NOW = new Date('2026-09-21T03:00:00Z');

// Answers the three reads `check()` makes: the heartbeat (fresh unless told
// otherwise), the overdue-object count, and the unresolved `mail_delivery`
// rows. Each component's own rules are its own spec's job; this file only
// needs the document's shape.
function fakeDb(
  options: { failingMail?: { kind: string }[]; beatAt?: Date | null } = {},
) {
  const rowsFor = (table: unknown) => {
    if (table === schedulerHeartbeat) {
      const beatAt = options.beatAt === undefined ? NOW : options.beatAt;
      return beatAt ? [{ beatAt }] : [];
    }
    if (table === mailDelivery) return options.failingMail ?? [];
    return [{ overdue: 0 }];
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows = Promise.resolve(rowsFor(table));
        return Object.assign(rows, { where: () => rows });
      },
    }),
  };
}

async function controllerWith(
  active: InsecureFlagName[],
  db: unknown = fakeDb(),
) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: InsecureFlags, useValue: { active } },
      { provide: DB, useValue: db },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return module.get(HealthController);
}

describe('HealthController', () => {
  it('names all four components', async () => {
    const document = await (await controllerWith([])).check();

    expect(document.status).toBe('ok');
    expect(Object.keys(document.components).sort()).toEqual(
      [...HEALTH_COMPONENT_NAMES].sort(),
    );
  });

  it('serves the scheduler alias as the same document shape', async () => {
    const controller = await controllerWith([]);
    expect(await controller.checkSchedulerAlias()).toEqual(
      await controller.check(),
    );
  });

  it('reports no insecure flags when both are off', async () => {
    const document = await (await controllerWith([])).check();
    expect(document.insecureFlags).toEqual([]);
  });

  it('reports the top-level status as degraded when any component is', async () => {
    const failingDb = fakeDb({
      failingMail: [{ kind: 'queue_notification' }],
    });
    const document = await (await controllerWith([], failingDb)).check();

    expect(document.status).toBe('degraded');
    expect(document.components.mail.status).toBe('degraded');
  });

  it('reports the scheduler degraded when the tick has never beaten', async () => {
    const document = await (
      await controllerWith([], fakeDb({ beatAt: null }))
    ).check();
    expect(document.status).toBe('degraded');
    expect(document.components.scheduler.status).toBe('degraded');
  });

  it('names each insecure flag that is on', async () => {
    const controller = await controllerWith([
      'ALLOW_INSECURE_TRANSPORT',
      'SMTP_ALLOW_PLAINTEXT',
    ]);
    const document = await controller.check();
    expect(document.insecureFlags).toEqual([
      'ALLOW_INSECURE_TRANSPORT',
      'SMTP_ALLOW_PLAINTEXT',
    ]);
  });
});
