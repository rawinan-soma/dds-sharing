import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import type { HealthDocument } from './health.types.js';

function fakeResponse() {
  return {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
}

describe('HealthController', () => {
  async function build(document: HealthDocument) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check: async () => document } }],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('answers 200 when healthy', async () => {
    const controller = await build({
      status: 'healthy',
      components: {
        scheduler: { status: 'healthy' },
        extraction: { status: 'healthy' },
        disk: { status: 'healthy' },
        mail: { status: 'healthy' },
      },
    });
    const res = fakeResponse();
    const body = await controller.health(res as never);
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('healthy');
  });

  it('answers a non-200 aggregate when unhealthy', async () => {
    const controller = await build({
      status: 'unhealthy',
      components: {
        scheduler: { status: 'healthy' },
        extraction: { status: 'healthy' },
        disk: { status: 'unhealthy' },
        mail: { status: 'healthy' },
      },
    });
    const res = fakeResponse();
    await controller.health(res as never);
    expect(res.statusCode).toBe(503);
  });

  it('the /health/scheduler alias returns the same document', async () => {
    const document: HealthDocument = {
      status: 'healthy',
      components: {
        scheduler: { status: 'healthy' },
        extraction: { status: 'healthy' },
        disk: { status: 'healthy' },
        mail: { status: 'healthy' },
      },
    };
    const controller = await build(document);
    const res = fakeResponse();
    const body = await controller.healthScheduler(res as never);
    expect(body).toEqual(document);
  });
});
