import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { InsecureFlagName, InsecureFlags } from '../config/insecure-flags';
import { DB } from '../db/database.module';
import { HealthController } from './health.controller';
import { HEALTH_COMPONENT_NAMES, HealthService } from './health.service';

// No currently-failing `mail_delivery` rows — the mail-health branch of
// `check()` is `mail-health.spec.ts`'s job; this file only needs it to not
// blow up.
const emptyDb = {
  select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
};

async function controllerWith(
  active: InsecureFlagName[],
  db: unknown = emptyDb,
) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: InsecureFlags, useValue: { active } },
      { provide: DB, useValue: db },
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
    const failingDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ kind: 'queue_notification' }]),
        }),
      }),
    };
    const document = await (await controllerWith([], failingDb)).check();

    expect(document.status).toBe('degraded');
    expect(document.components.mail.status).toBe('degraded');
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
