import { INestApplication } from '@nestjs/common';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { Tick } from '../src/scheduler/tick';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// @nestjs/serve-static picks its Express/Fastify loader from
// HttpAdapterHost.httpAdapter at provider-resolution time. Test.createTestingModule()
// resolves providers during .compile(), before createNestApplication() attaches the
// adapter, so it silently falls back to a no-op loader. NestFactory.create() attaches
// the adapter first, matching how main.ts actually boots — so the e2e app is built the
// same way here. The environment comes from .env.test (test/setup-env.ts); only the
// database URL is this file's own, set in beforeAll before the pool is built.
describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;
  let db: ScratchDatabase;
  const originalUrl = process.env.APP_DATABASE_URL;

  beforeAll(async () => {
    // The app refuses to boot without the seeded reference data (§6.4).
    db = await createScratchDatabase();
    process.env.APP_DATABASE_URL = db.appUrl;

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    await app.init();
    // One pass, as main.ts's startup reconcile would make: the heartbeat is
    // what keeps the `scheduler` component ok (§15.3).
    await app.get(Tick).runPass();
  });

  afterAll(async () => {
    await app.close();
    process.env.APP_DATABASE_URL = originalUrl;
    await db.drop();
  });

  it('serves the SPA shell at /', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toContain('spa shell fixture for tests');
  });

  it('answers the health document under the API prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      components: {
        scheduler: { status: 'ok' },
        extraction: { status: 'ok' },
        disk: { status: 'ok' },
        mail: { status: 'ok' },
      },
      insecureFlags: [],
    });
  });

  it('keeps /api/health/scheduler as an alias of the same document', async () => {
    const health = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    const alias = await request(app.getHttpServer())
      .get('/api/health/scheduler')
      .expect(200);

    expect(alias.body).toEqual(health.body);
  });

  it('never lets the SPA shell swallow an unmatched API route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404);

    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.text).not.toContain('spa shell fixture for tests');
  });
});
