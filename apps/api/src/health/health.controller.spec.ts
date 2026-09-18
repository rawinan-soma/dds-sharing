import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get(HealthController);
  });

  it('names all four components', () => {
    const document = controller.check();

    expect(document.status).toBe('ok');
    expect(Object.keys(document.components).sort()).toEqual([
      'disk',
      'extraction',
      'mail',
      'scheduler',
    ]);
  });

  it('serves the scheduler alias as the same document shape', () => {
    expect(controller.checkSchedulerAlias()).toEqual(controller.check());
  });
});
