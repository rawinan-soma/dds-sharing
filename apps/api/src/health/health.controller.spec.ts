import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { InsecureFlagName, InsecureFlags } from '../config/insecure-flags';
import { HealthController } from './health.controller';
import { HEALTH_COMPONENT_NAMES, HealthService } from './health.service';

async function controllerWith(active: InsecureFlagName[]) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: InsecureFlags, useValue: { active } },
    ],
  }).compile();
  return module.get(HealthController);
}

describe('HealthController', () => {
  it('names all four components', async () => {
    const document = (await controllerWith([])).check();

    expect(document.status).toBe('ok');
    expect(Object.keys(document.components).sort()).toEqual(
      [...HEALTH_COMPONENT_NAMES].sort(),
    );
  });

  it('serves the scheduler alias as the same document shape', async () => {
    const controller = await controllerWith([]);
    expect(controller.checkSchedulerAlias()).toEqual(controller.check());
  });

  it('reports no insecure flags when both are off', async () => {
    expect((await controllerWith([])).check().insecureFlags).toEqual([]);
  });

  it('names each insecure flag that is on', async () => {
    const controller = await controllerWith([
      'ALLOW_INSECURE_TRANSPORT',
      'SMTP_ALLOW_PLAINTEXT',
    ]);
    expect(controller.check().insecureFlags).toEqual([
      'ALLOW_INSECURE_TRANSPORT',
      'SMTP_ALLOW_PLAINTEXT',
    ]);
  });
});
