/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { catalogue } from '../src/i18n/copy-catalogue';
import { ARCHIVE_STORE } from '../src/extraction/extraction.module';
import { ATTEMPT_CAP } from '../src/delivery/resolve-token';
import { hashToken } from '../src/delivery/token';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { fakeArchiveStore } from './support/fake-archive-store';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// `/d/<token>` and `/d/<token>/archive` (spec §9, §16.2, ADR 0018): the
// server-rendered collection page and the range-request-capable archive
// route, both outside the `/api` prefix on purpose (§16.2's fixed address).
describe('delivery and collection (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication<App>;
  let archiveStore: ReturnType<typeof fakeArchiveStore>;
  const originalDbUrl = process.env.APP_DATABASE_URL;

  async function insertRequest(): Promise<{ id: string; reference: string }> {
    const reference = `REQ-TEST-${randomUUID().slice(0, 8)}`;
    const { rows } = await scratch.owner.query(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, 'approved', now(), 'silicosis', 'โรคซิลิโคสิส',
               '2025-01-01', '2025-01-31', '{999}', '{}')
       RETURNING id`,
      [reference],
    );
    return { id: rows[0].id as string, reference };
  }

  /** Uploads an archive to the fake store and seeds a live `download_token` row for it. */
  async function insertLiveToken(
    requestId: string,
    overrides: { expiresAt?: Date; revokedAt?: Date | null } = {},
  ): Promise<{ rawToken: string; tokenId: string; archiveFilename: string }> {
    const rawToken = `test-${randomUUID()}`;
    const archiveFilename = `${randomUUID()}.zip`;
    await archiveStore.upload(archiveFilename, Buffer.from('0123456789'));

    const expiresAt =
      overrides.expiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000);
    const { rows } = await scratch.owner.query(
      `INSERT INTO download_token (request_id, token_hash, archive_filename, created_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, now(), $4, $5)
       RETURNING id`,
      [
        requestId,
        hashToken(rawToken),
        archiveFilename,
        expiresAt,
        overrides.revokedAt ?? null,
      ],
    );
    return { rawToken, tokenId: rows[0].id as string, archiveFilename };
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;

    archiveStore = fakeArchiveStore();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ARCHIVE_STORE)
      .useValue(archiveStore)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.APP_DATABASE_URL = originalDbUrl;
    await scratch.drop();
  });

  it('renders the expiry page itself, the target every dead-token redirect above points at', async () => {
    const response = await request(app.getHttpServer())
      .get('/link-expired')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain(catalogue.t('requester_expired_title'));
    expect(response.text).toContain(catalogue.t('app_telephone'));
    expect(response.text).not.toMatch(/REQ-/);
  });

  it('redirects an unknown token to /link-expired from either route, auditing a row with no Request', async () => {
    await request(app.getHttpServer())
      .get('/d/does-not-exist')
      .expect(302)
      .expect('Location', '/link-expired');
    await request(app.getHttpServer())
      .get('/d/does-not-exist/archive')
      .expect(302)
      .expect('Location', '/link-expired');

    const { rows } = await scratch.owner.query(
      `SELECT kind, outcome, request_id AS "requestId", download_token_id AS "downloadTokenId"
       FROM token_lookup WHERE token_prefix = $1 ORDER BY id`,
      ['does-not'],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.outcome).toBe('unknown_token');
      expect(row.requestId).toBeNull();
      expect(row.downloadTokenId).toBeNull();
    }
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual([
      'page',
      'archive',
    ]);
  });

  it('redirects an expired token to /link-expired', async () => {
    const { id } = await insertRequest();
    const { rawToken } = await insertLiveToken(id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await request(app.getHttpServer())
      .get(`/d/${rawToken}`)
      .expect(302)
      .expect('Location', '/link-expired');
  });

  it('renders the collection page for a live token, with no Angular bundle required', async () => {
    const { id, reference } = await insertRequest();
    const { rawToken, archiveFilename } = await insertLiveToken(id);

    const response = await request(app.getHttpServer())
      .get(`/d/${rawToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain(reference);
    expect(response.text).toContain(archiveFilename);
    expect(response.text).not.toContain('<script');
  });

  it('streams the archive with Accept-Ranges and a working Content-Disposition filename', async () => {
    const { id } = await insertRequest();
    const { rawToken, archiveFilename } = await insertLiveToken(id);

    const response = await request(app.getHttpServer())
      .get(`/d/${rawToken}/archive`)
      .expect(200);

    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-disposition']).toContain(archiveFilename);
    expect(response.text).toBe('0123456789');
  });

  it('moves the Request to collected on its first Attempt, and not on a page view', async () => {
    const { id } = await insertRequest();
    const { rawToken } = await insertLiveToken(id);
    const stateOf = async () =>
      (
        await scratch.owner.query('SELECT state FROM request WHERE id = $1', [
          id,
        ])
      ).rows[0].state as string;

    await request(app.getHttpServer()).get(`/d/${rawToken}`).expect(200);
    expect(await stateOf()).toBe('approved');

    await request(app.getHttpServer())
      .get(`/d/${rawToken}/archive`)
      .expect(200);
    expect(await stateOf()).toBe('collected');
  });

  it('clears an open collection lapse as system on a late collection, crediting no Reviewer (§10.6)', async () => {
    const { id } = await insertRequest();
    const { rawToken } = await insertLiveToken(id);
    const {
      rows: [approver],
    } = await scratch.owner.query(
      `INSERT INTO reviewer (username, display_name, email, password_hash, totp_secret)
       VALUES ($1, 'Lapse Approver', 'lapse@example.go.th', 'x', 'x') RETURNING id`,
      [`lapse-${randomUUID().slice(0, 8)}`],
    );
    await scratch.owner.query(
      `INSERT INTO request_event (request_id, type, actor_type, reviewer_id, occurred_at, payload)
       VALUES ($1, 'approved', 'reviewer', $2, now() - interval '2 days', '{}')`,
      [id, approver.id],
    );
    await scratch.owner.query(
      `INSERT INTO request_event (request_id, type, actor_type, occurred_at, payload)
       VALUES ($1, 'collection_lapse_raised', 'system', now() - interval '1 hour',
               '{"wallClockHoursElapsed": 24}')`,
      [id],
    );

    await request(app.getHttpServer())
      .get(`/d/${rawToken}/archive`)
      .expect(200);
    // A second Attempt clears nothing more.
    await request(app.getHttpServer())
      .get(`/d/${rawToken}/archive`)
      .expect(200);

    const { rows } = await scratch.owner.query(
      `SELECT actor_type, reviewer_id, payload FROM request_event
       WHERE request_id = $1 AND type = 'collection_lapse_cleared'`,
      [id],
    );
    expect(rows).toEqual([
      {
        actor_type: 'system',
        reviewer_id: null,
        payload: {
          outcome: null,
          assignedReviewerId: approver.id,
          clearingReviewerId: null,
        },
      },
    ]);
  });

  it('honours a Range request with a 206 and Content-Range', async () => {
    const { id } = await insertRequest();
    const { rawToken } = await insertLiveToken(id);

    const response = await request(app.getHttpServer())
      .get(`/d/${rawToken}/archive`)
      .set('Range', 'bytes=2-4')
      .expect(206);

    expect(response.headers['content-range']).toBe('bytes 2-4/10');
    expect(response.text).toBe('234');
  });

  it(`redirects the ${ATTEMPT_CAP + 1}th archive presentation as attempts_exhausted`, async () => {
    const { id } = await insertRequest();
    const { rawToken } = await insertLiveToken(id);

    for (let i = 0; i < ATTEMPT_CAP; i++) {
      await request(app.getHttpServer())
        .get(`/d/${rawToken}/archive`)
        .expect(200);
    }
    await request(app.getHttpServer())
      .get(`/d/${rawToken}/archive`)
      .expect(302)
      .expect('Location', '/link-expired');
  });

  it('blocks an IP for an hour after 20 failed lookups, but never a valid presentation', async () => {
    // A clean slate for this IP, regardless of what earlier tests in this
    // file already logged against it.
    await scratch.owner.query('DELETE FROM download_throttle');

    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer())
        .get(`/d/no-such-token-${i}`)
        .expect(302);
    }
    await request(app.getHttpServer()).get('/d/no-such-token-21').expect(429);

    // The block never touches a genuinely live token from the same IP (spec
    // §9.2 — retrying an interrupted transfer must always work).
    const { id } = await insertRequest();
    const { rawToken } = await insertLiveToken(id);
    await request(app.getHttpServer()).get(`/d/${rawToken}`).expect(200);
  });

  it("reflects a failing queue_notification in /api/health's mail component", async () => {
    const { id } = await insertRequest();
    await scratch.owner.query(
      `INSERT INTO mail_delivery (request_id, kind, status, attempts)
       VALUES ($1, 'queue_notification', 'failed', 1)`,
      [id],
    );

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body.components.mail.status).toBe('degraded');
    expect(response.body.status).toBe('degraded');
  });
});
