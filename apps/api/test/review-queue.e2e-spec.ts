/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/reviewer/clock';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import { Browser, TestClock } from './support/browser';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const ict = (local: string) => new Date(`${local}:00+07:00`);

// The read-only queue and review screen's API (spec §10.1, §10.2, §15.1),
// against a real database and a clock the test moves by hand.
describe('the Reviewer queue (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let server: App;
  let appPool: Pool;
  let signedIn: Browser;
  // Monday 12:00 ICT.
  const clock = new TestClock(ict('2026-09-21T12:00').getTime());
  const originalUrl = process.env.APP_DATABASE_URL;

  async function submitted(
    reference: string,
    at: string,
    extra: {
      state?: string;
      provinces?: string[];
      group?: [string, string];
      codes?: string[];
      name?: string;
    } = {},
  ) {
    const [groupId, groupName] = extra.group ?? ['silicosis', 'โรคซิลิโคสิส'];
    const { rows } = await scratch.owner.query(
      `INSERT INTO request (reference, state, submitted_at, disease_group_id,
         disease_group_name, start_date, end_date, report_codes, provinces)
       VALUES ($1, $2, $3, $4, $5, '2025-01-01', '2025-01-31', $6, $7) RETURNING id`,
      [
        reference,
        extra.state ?? 'pending',
        ict(at),
        groupId,
        groupName,
        extra.codes ?? ['202', '203'],
        extra.provinces ?? [],
      ],
    );
    await scratch.owner.query(
      `INSERT INTO request_contact (request_id, name, surname, tel, email, workplace)
       VALUES ($1, $2, 'Jaidee', '081 234 5678', $3, 'Regional Office 1')`,
      [rows[0].id, extra.name ?? 'Somchai', `${reference}@example.go.th`],
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    delete process.env.REVIEWER_INSECURE_COOKIE;
    appPool = new Pool({ connectionString: scratch.appUrl });
    appPool.on('error', () => {});

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0);
    server = app.getHttpServer() as App;

    const accounts = new ReviewerAccounts(drizzle(appPool), clock);
    const seeded = await accounts.seed({
      username: 'queue.reviewer',
      displayName: 'Queue Reviewer',
      email: 'queue@example.go.th',
    });
    await scratch.owner.query(
      `UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false
       WHERE id = $1`,
      [seeded.reviewerId],
    );
    signedIn = new Browser(server);
    await signedIn.get('/api/reviewer/session');
    const res = await signedIn.post('/api/reviewer/sign-in', {
      username: 'queue.reviewer',
      password: seeded.password,
      code: phoneCode(seeded.totpSecret, clock.now().getTime()),
    });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    process.env.APP_DATABASE_URL = originalUrl;
    await scratch.drop();
  });

  it('is behind authentication', async () => {
    const anonymous = new Browser(server);
    expect((await anonymous.get('/api/reviewer/queue')).status).toBe(401);
    expect(
      (
        await anonymous.get(
          '/api/reviewer/queue/00000000-0000-4000-8000-000000000000',
        )
      ).status,
    ).toBe(401);
  });

  it('is empty, and says when it was read, when nothing is pending', async () => {
    const res = await signedIn.get('/api/reviewer/queue');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      generatedAt: clock.now().toISOString(),
      requests: [],
    });
  });

  describe('with Requests stored', () => {
    let older: string;
    let newer: string;
    let regional: string;
    let stale: string;
    let approved: string;

    beforeAll(async () => {
      newer = await submitted('REQ-2569-0002', '2026-09-21T10:00', {
        name: 'Newer',
      });
      older = await submitted('REQ-2569-0001', '2026-09-21T09:00', {
        name: 'Older',
        provinces: ['50'],
      });
      regional = await submitted('REQ-2569-0003', '2026-09-21T11:00', {
        name: 'Regional',
        group: ['heat', 'โรคจากความร้อน'],
        codes: ['501'],
        provinces: ['50', '51', '52', '54', '55', '56', '57', '58'],
      });
      // Past 24 business hours on Monday 12:00: still `pending` in the row.
      stale = await submitted('REQ-2569-0000', '2026-09-14T09:00', {
        name: 'Stale',
      });
      approved = await submitted('REQ-2569-0009', '2026-09-21T08:45', {
        state: 'approved',
        name: 'Approved',
      });
    });

    it('lists pending Requests only, oldest first', async () => {
      const res = await signedIn.get('/api/reviewer/queue');
      const ids = res.body.requests.map((r: { id: string }) => r.id);
      expect(ids).toEqual([stale, older, newer, regional]);
      expect(ids).not.toContain(approved);
    });

    it('carries the clock: time left, and how many are ahead', async () => {
      const res = await signedIn.get('/api/reviewer/queue');
      const [staleRow, olderRow, newerRow, regionalRow] = res.body.requests;
      expect(olderRow).toMatchObject({
        reference: 'REQ-2569-0001',
        requesterName: 'Older Jaidee',
        diseaseGroupName: 'โรคซิลิโคสิส',
        ahead: 0,
        minutesLeft: 21 * 60,
        expired: false,
        submittedAt: ict('2026-09-21T09:00').toISOString(),
      });
      expect(newerRow.ahead).toBe(1);
      expect(regionalRow.ahead).toBe(2);
      expect(staleRow).toMatchObject({
        expired: true,
        minutesLeft: 0,
        ahead: null,
      });
    });

    it('puts only the queue row on the list: contact detail waits for the dossier', async () => {
      const res = await signedIn.get('/api/reviewer/queue');
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('081 234 5678');
      expect(text).not.toContain('@example.go.th');
      expect(text).not.toContain('Regional Office 1');
    });

    it('shows the five contact fields, the ask in human terms, and the code expansion', async () => {
      const res = await signedIn.get(`/api/reviewer/queue/${older}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        reference: 'REQ-2569-0001',
        contact: {
          name: 'Older',
          surname: 'Jaidee',
          tel: '081 234 5678',
          email: 'REQ-2569-0001@example.go.th',
          workplace: 'Regional Office 1',
        },
        diseaseGroupName: 'โรคซิลิโคสิส',
        reportCodes: ['202', '203'],
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        area: {
          kind: 'provinces',
          provinces: [{ id: '50', name: 'เชียงใหม่' }],
          region: null,
        },
        ahead: 0,
        minutesLeft: 21 * 60,
        expired: false,
        rowCount: null,
      });
    });

    it('names the area: nationwide, and a whole health region', async () => {
      const national = await signedIn.get(`/api/reviewer/queue/${newer}`);
      expect(national.body.area).toEqual({ kind: 'national' });

      const region = await signedIn.get(`/api/reviewer/queue/${regional}`);
      expect(region.body.area).toMatchObject({ kind: 'provinces', region: 1 });
      expect(region.body.area.provinces).toHaveLength(8);
    });

    it('offers no history, no case rows, no IP and no drain estimate', async () => {
      const res = await signedIn.get(`/api/reviewer/queue/${older}`);
      expect(Object.keys(res.body).sort()).toEqual(
        [
          'ahead',
          'area',
          'contact',
          'diseaseGroupName',
          'endDate',
          'expired',
          'expiresAt',
          'id',
          'minutesLeft',
          'reference',
          'reportCodes',
          'requesterName',
          'rowCount',
          'startDate',
          'submittedAt',
        ].sort(),
      );
    });

    it('renders a Request past the threshold as expired, from the clock alone', async () => {
      const res = await signedIn.get(`/api/reviewer/queue/${stale}`);
      expect(res.body).toMatchObject({ expired: true, minutesLeft: 0 });
    });

    it('has nothing for a decided, unknown or malformed id', async () => {
      for (const id of [
        approved,
        '00000000-0000-4000-8000-000000000000',
        'not-a-uuid',
      ]) {
        const res = await signedIn.get(`/api/reviewer/queue/${id}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
      }
    });

    it('follows the clock on every read: nothing about the time is stored', async () => {
      clock.advance(50 * 60 * 1000); // inside the idle window
      const res = await signedIn.get(`/api/reviewer/queue/${older}`);
      expect(res.body).toMatchObject({
        expired: false,
        minutesLeft: 21 * 60 - 50,
      });
    });
  });
});
