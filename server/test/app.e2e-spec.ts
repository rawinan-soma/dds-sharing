import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { resolve } from 'node:path';
import { AppModule } from './../src/app.module.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.BASE_URL = 'https://example.test';
    process.env.DATABASE_URL = 'postgres://example';
    process.env.STATIC_ROOT = resolve(process.cwd(), '../web/dist/web/browser');
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health answers 200 with per-component statuses', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.status).toBeDefined();
    expect(response.body.components).toMatchObject({
      scheduler: { status: expect.any(String) },
      extraction: { status: expect.any(String) },
      disk: { status: expect.any(String) },
      mail: { status: expect.any(String) },
    });
  });

  it('GET /health/scheduler returns the same document as /health', async () => {
    const health = await request(app.getHttpServer()).get('/health').expect(200);
    const alias = await request(app.getHttpServer()).get('/health/scheduler').expect(200);
    expect(alias.body).toEqual(health.body);
  });

  it('GET /api is never swallowed by the static handler', () => {
    return request(app.getHttpServer()).get('/api').expect(200).expect({ ok: true });
  });

  it('an unmatched /api sub-path 404s instead of falling back to the SPA', () => {
    return request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });

  it('GET / serves the Angular SPA', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.text).toContain('<app-root></app-root>');
  });

  it('an Angular client route falls back to the SPA shell', async () => {
    const response = await request(app.getHttpServer()).get('/reviewer/queue').expect(200);
    expect(response.text).toContain('<app-root></app-root>');
  });

  afterEach(async () => {
    await app.close();
  });
});
