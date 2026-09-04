import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DiskHealthService } from '../src/health/disk-health.service.js';

process.env.BASE_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgres://dds:dds@localhost:5432/dds_sharing';

describe('/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DiskHealthService)
      .useValue({ check: async () => ({ status: 'healthy', usedPercent: 10 }) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['health', 'health/scheduler', 'd/{*splat}'],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with per-component statuses when everything is healthy', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'healthy',
      components: {
        scheduler: { status: 'healthy' },
        extraction: { status: 'healthy' },
        disk: { status: 'healthy', usedPercent: 10 },
        mail: { status: 'healthy' },
      },
    });
  });

  it('serves the same document at the /health/scheduler alias', async () => {
    const response = await request(app.getHttpServer()).get('/health/scheduler');

    expect(response.status).toBe(200);
    expect(response.body.components.scheduler).toEqual({ status: 'healthy' });
  });

  it('never sits behind the /api prefix', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(404);
  });
});
