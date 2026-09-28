/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
   JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/clock/clock';
import { ExtractionQueue } from '../src/extraction/extraction-queue';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import { Browser, TestClock } from './support/browser';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// A service with its own record stamps its own prefix (spec §12.5, ADR 0022):
// the Pilot runs with REFERENCE_PREFIX=PLT, so a reference quoted over the
// telephone names the service that holds it.
describe('a configured reference prefix (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let appPool: Pool;
  let requester: Browser;
  let reviewer: Browser;
  const clock = new TestClock(Date.now());
  const originalUrl = process.env.APP_DATABASE_URL;
  const originalPrefix = process.env.REFERENCE_PREFIX;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    process.env.REFERENCE_PREFIX = 'PLT';
    appPool = new Pool({ connectionString: scratch.appUrl });
    appPool.on('error', () => {});

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(ExtractionQueue)
      .useValue({ enqueue: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    await app.listen(0);
    const server = app.getHttpServer() as App;
    requester = new Browser(server);

    const seeded = await new ReviewerAccounts(drizzle(appPool), clock).seed({
      username: 'owner',
      displayName: 'Pilot Owner',
      email: 'owner@example.go.th',
    });
    await scratch.owner.query(
      `UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false
       WHERE id = $1`,
      [seeded.reviewerId],
    );
    reviewer = new Browser(server);
    await reviewer.get('/api/reviewer/session');
    const signIn = await reviewer.post('/api/reviewer/sign-in', {
      username: 'owner',
      password: seeded.password,
      code: phoneCode(seeded.totpSecret, clock.now().getTime()),
    });
    expect(signIn.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    process.env.APP_DATABASE_URL = originalUrl;
    if (originalPrefix === undefined) delete process.env.REFERENCE_PREFIX;
    else process.env.REFERENCE_PREFIX = originalPrefix;
    await scratch.drop();
  });

  it('stamps the configured prefix on a submitted Request, and the lookup reads it back whole', async () => {
    const submitted = await requester.post('/api/requests', {
      diseaseGroupId: 'silicosis',
      from: '2025-01-01',
      to: '2025-01-31',
      contact: {
        name: 'Somchai',
        surname: 'Jaidee',
        tel: '081 234 5678',
        email: 'somchai@example.go.th',
        workplace: 'Regional Office 1',
      },
    });
    expect(submitted.status).toBe(201);
    const { reference } = submitted.body as { reference: string };
    expect(reference).toMatch(/^PLT-\d{4}-\d{4,}$/);

    const [stored] = (
      await scratch.owner.query('SELECT reference FROM request')
    ).rows;
    expect(stored.reference).toBe(reference);

    const lookup = (value: string) =>
      reviewer.get(
        `/api/reviewer/lookup?reference=${encodeURIComponent(value)}`,
      );
    expect((await lookup(reference)).body.zone).toBe('queue');
    // The same number under another service's prefix is another Request.
    expect((await lookup(reference.replace(/^PLT-/, 'REQ-'))).status).toBe(404);
  });
});
