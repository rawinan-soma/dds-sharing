import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// The app is built the way main.ts builds it (NestFactory, so the static handler
// is real), with the SPA shell fixture standing in for the Angular build.
describe('the /reviewer surface (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication<App>;
  const originalUrl = process.env.APP_DATABASE_URL;
  // express's sendFile refuses a path with a dot-directory in it, which is where
  // a git worktree can live; the fixture is copied somewhere that has none.
  const staticRoot = mkdtempSync(join(tmpdir(), 'dds-spa-'));

  async function boot() {
    const built = await NestFactory.create(AppModule, { logger: false });
    built.setGlobalPrefix('api');
    await built.init();
    return built as INestApplication<App>;
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    cpSync(join(__dirname, 'fixtures/public'), staticRoot, { recursive: true });
    process.env.STATIC_ROOT = staticRoot;
    delete process.env.REVIEWER_INSECURE_COOKIE;
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
    process.env.APP_DATABASE_URL = originalUrl;
    delete process.env.STATIC_ROOT;
    delete process.env.REVIEWER_INSECURE_COOKIE;
    rmSync(staticRoot, { recursive: true, force: true });
    await scratch.drop();
  });

  it.each([
    '/reviewer',
    '/reviewer/queue',
    '/reviewer/sign-in?returnTo=%2Freviewer%2Fqueue',
  ])('serves the SPA shell at %s with noindex', async (path) => {
    const res = await request(app.getHttpServer()).get(path).expect(200);
    expect(res.text).toContain('spa shell fixture for tests');
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
  });

  it('sends no noindex on the public pages', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    const other = await request(app.getHttpServer())
      .get('/some/spa/route')
      .expect(200);
    expect(other.headers['x-robots-tag']).toBeUndefined();
    expect(other.text).toContain('spa shell fixture for tests');
  });

  it('does not let the shell swallow an unmatched /api/reviewer route', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reviewer/nothing-here')
      .expect(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.text).not.toContain('spa shell fixture for tests');
  });

  it('still reaches the real reviewer API under the catch-all', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reviewer/session')
      .expect(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it('links to the reviewer surface from nowhere in the public shell', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.text).not.toMatch(/reviewer/i);
  });

  describe('the cookie flags', () => {
    async function signInCookies() {
      const pool = new Pool({ connectionString: scratch.appUrl });
      pool.on('error', () => {});
      const accounts = new ReviewerAccounts(drizzle(pool), {
        now: () => new Date(),
      });
      const username = `flags${Date.now() % 100000}`;
      const seeded = await accounts.seed({
        username,
        displayName: 'Flags Tester',
        email: 'flags@example.go.th',
      });
      await scratch.owner.query(
        'UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false WHERE id = $1',
        [seeded.reviewerId],
      );
      await pool.end();

      const server = app.getHttpServer();
      const first = await request(server).get('/api/reviewer/session');
      const csrf = /reviewer_csrf=([^;]+)/.exec(
        ([] as string[]).concat(first.headers['set-cookie'])[0],
      )![1];
      const res = await request(server)
        .post('/api/reviewer/sign-in')
        .set('Cookie', `reviewer_csrf=${csrf}`)
        .set('X-CSRF-Token', csrf)
        .send({
          username,
          password: seeded.password,
          code: phoneCode(seeded.totpSecret, Date.now()),
        });
      expect(res.status).toBe(200);
      return ([] as string[]).concat(res.headers['set-cookie']);
    }

    it('is Secure by default', async () => {
      const cookies = await signInCookies();
      const session = cookies.find((c) => c.startsWith('reviewer_session='))!;
      const csrf = cookies.find((c) => c.startsWith('reviewer_csrf='))!;
      expect(session).toMatch(/; Secure/);
      expect(session).toMatch(/HttpOnly/);
      expect(session).toMatch(/SameSite=Lax/);
      expect(csrf).toMatch(/; Secure/);
      expect(csrf).not.toMatch(/HttpOnly/);
    });

    it('drops Secure only under the explicit development flag', async () => {
      await app.close();
      process.env.REVIEWER_INSECURE_COOKIE = 'true';
      app = await boot();
      const cookies = await signInCookies();
      const session = cookies.find((c) => c.startsWith('reviewer_session='))!;
      expect(session).not.toMatch(/Secure/);
      expect(session).toMatch(/HttpOnly/);
      expect(session).toMatch(/SameSite=Lax/);
    });
  });
});
