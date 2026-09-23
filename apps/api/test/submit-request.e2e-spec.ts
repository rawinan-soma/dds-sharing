import { INestApplication } from '@nestjs/common';
import { API_PREFIX, API_PREFIX_EXCLUDE } from '../src/global-prefix';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

interface ReferenceData {
  diseaseGroups: { id: string; name: string }[];
  provinces: { provinceId: string; nameTh: string; healthRegion: number }[];
}
interface Submitted {
  reference: string;
}
interface Refusal {
  code?: string;
  message?: string;
  errors: { field: string; code: string; message: string }[];
}

// Submitting a Request, end to end against a real database (spec §4, §12.3).
describe('submit a Request (e2e)', () => {
  let app: INestApplication<App>;
  let db: ScratchDatabase;
  let appPool: Pool;
  const originalUrl = process.env.APP_DATABASE_URL;

  const contact = {
    name: 'Somchai',
    surname: 'Jaidee',
    tel: '081 234 5678',
    email: 'somchai@example.go.th',
    workplace: 'Regional Office 1',
  };
  const valid = {
    diseaseGroupId: 'silicosis',
    from: '2025-01-01',
    to: '2025-01-31',
    contact,
  };

  // `trust proxy` lets a test speak as different IPs, which is how the edge
  // will present them in production.
  const post = (body: unknown, ip = '10.0.0.1') =>
    request(app.getHttpServer())
      .post('/api/requests')
      .set('X-Forwarded-For', ip)
      .set('User-Agent', 'vitest-agent/1.0')
      .send(body as object);

  const rows = async <T>(sql: string, params: unknown[] = []) =>
    (await db.owner.query(sql, params)).rows as T[];

  beforeAll(async () => {
    db = await createScratchDatabase();
    process.env.APP_DATABASE_URL = db.appUrl;

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
    (
      app.getHttpAdapter().getInstance() as {
        set: (k: string, v: unknown) => void;
      }
    ).set('trust proxy', true);
    await app.init();

    appPool = new Pool({ connectionString: db.appUrl });
  });

  afterAll(async () => {
    await appPool.end();
    await app.close();
    process.env.APP_DATABASE_URL = originalUrl;
    await db.drop();
  });

  beforeEach(async () => {
    // The event tables are append-only to the application, but the owner may
    // clear a scratch database between cases.
    await db.owner.query(
      'TRUNCATE request_event, request_contact, request CASCADE',
    );
  });

  describe('GET /api/reference', () => {
    it('offers exactly the ten Disease groups by id and name, with no Report code', async () => {
      const { body } = (await request(app.getHttpServer())
        .get('/api/reference')
        .expect(200)) as { body: ReferenceData };

      expect(body.diseaseGroups).toHaveLength(10);
      for (const group of body.diseaseGroups) {
        expect(Object.keys(group).sort()).toEqual(['id', 'name']);
      }
      expect(JSON.stringify(body.diseaseGroups)).not.toMatch(/\b2\d\d\b|501/);
    });

    it('offers the 77 provinces with their health region', async () => {
      const { body } = (await request(app.getHttpServer())
        .get('/api/reference')
        .expect(200)) as { body: ReferenceData };

      expect(body.provinces).toHaveLength(77);
      expect(body.provinces[0]).toEqual({
        provinceId: '10',
        nameTh: 'กรุงเทพมหานคร',
        healthRegion: 13,
      });
    });
  });

  describe('POST /api/requests', () => {
    it('stores the Request and answers with a reference number and nothing else', async () => {
      const { body } = (await post(valid).expect(201)) as { body: Submitted };

      expect(Object.keys(body)).toEqual(['reference']);
      expect(body.reference).toMatch(/^REQ-\d{4}-\d{4,}$/);
      const [stored] = await rows<{ reference: string; state: string }>(
        'SELECT reference, state FROM request',
      );
      expect(stored).toEqual({ reference: body.reference, state: 'pending' });
    });

    it('stores the expansions, and the group and inclusive dates as the human made the ask', async () => {
      await post({ ...valid, diseaseGroupId: 'asbestos' }).expect(201);

      const [stored] = await rows<Record<string, unknown>>(
        `SELECT disease_group_id, disease_group_name, start_date::text, end_date::text,
                report_codes, provinces FROM request`,
      );
      expect(stored).toEqual({
        disease_group_id: 'asbestos',
        disease_group_name: 'โรคจากแร่ใยหิน',
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        report_codes: ['204', '205', '206', '207'],
        provinces: [],
      });
    });

    it('stores a health region as its provinces and never as a region', async () => {
      await post({ ...valid, area: { region: 13 } }).expect(201);

      const [stored] = await rows<{ provinces: string[] }>(
        'SELECT provinces FROM request',
      );
      const expected = await rows<{ province_id: string }>(
        'SELECT province_id FROM province WHERE health_region = 13 ORDER BY province_id',
      );
      expect(stored.provinces).toEqual(expected.map((p) => p.province_id));
      expect(stored.provinces.length).toBeGreaterThan(0);
      const columns = await rows<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'request'`,
      );
      expect(columns.map((c) => c.column_name)).not.toContain('region');
    });

    it('stores a single province as exactly that province', async () => {
      await post({ ...valid, area: { provinceId: '50' } }).expect(201);

      const [stored] = await rows<{ provinces: string[] }>(
        'SELECT provinces FROM request',
      );
      expect(stored.provinces).toEqual(['50']);
    });

    it('keeps the contact fields in their own table and none of them on the Request row', async () => {
      await post(valid).expect(201);

      const [stored] = await rows<Record<string, unknown>>(
        'SELECT * FROM request',
      );
      expect(JSON.stringify(stored)).not.toContain('Somchai');
      expect(JSON.stringify(stored)).not.toContain('example.go.th');
      const requestColumns = Object.keys(stored);
      for (const field of Object.keys(contact)) {
        expect(requestColumns).not.toContain(field);
      }

      const [saved] = await rows<Record<string, string>>(
        `SELECT name, surname, tel, email, workplace FROM request_contact`,
      );
      expect(saved).toEqual(contact);
    });

    it('accepts free text in every contact field without validating or verifying it', async () => {
      await post({
        ...valid,
        contact: {
          name: '?',
          surname: '?',
          tel: 'ask at reception',
          email: 'not an email at all',
          workplace: 'somewhere no list would have',
        },
      }).expect(201);
    });

    it('writes one `submitted` event carrying the IP and user agent', async () => {
      const { body } = (await post(valid, '203.0.113.7').expect(201)) as {
        body: Submitted;
      };

      const events = await rows<Record<string, unknown>>(
        `SELECT e.type, e.actor_type, host(e.ip) AS ip, e.user_agent, e.payload
           FROM request_event e JOIN request r ON r.id = e.request_id
          WHERE r.reference = $1`,
        [body.reference],
      );
      expect(events).toEqual([
        {
          type: 'submitted',
          actor_type: 'requester',
          ip: '203.0.113.7',
          user_agent: 'vitest-agent/1.0',
          payload: {},
        },
      ]);
    });

    it('numbers Requests in sequence', async () => {
      const first = (await post(valid, '10.0.0.1').expect(201)) as {
        body: Submitted;
      };
      const second = (await post(valid, '10.0.0.2').expect(201)) as {
        body: Submitted;
      };

      const counter = (reference: string) => Number(reference.split('-')[2]);
      expect(counter(second.body.reference)).toBe(
        counter(first.body.reference) + 1,
      );
    });

    it('never puts a row count in the response', async () => {
      const { text } = await post(valid).expect(201);

      expect(text).not.toMatch(/row|count|total/i);
    });
  });

  describe('the 365-day cap, server side', () => {
    it('refuses an over-span Request, attributes the cap to upstream, and stores nothing', async () => {
      const { body } = (await post({
        ...valid,
        from: '2025-01-01',
        to: '2026-01-02',
      }).expect(400)) as {
        body: Refusal;
      };

      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].field).toBe('to');
      expect(body.errors[0].code).toBe('span_too_long');
      expect(body.errors[0].message).toMatch(/upstream/i);
      expect(await rows('SELECT 1 FROM request')).toHaveLength(0);
      expect(await rows('SELECT 1 FROM request_event')).toHaveLength(0);
    });

    it('accepts exactly 365 days', async () => {
      await post({ ...valid, from: '2025-01-01', to: '2026-01-01' }).expect(
        201,
      );
    });
  });

  describe('area selection', () => {
    it('refuses a province together with a region', async () => {
      const { body } = (await post({
        ...valid,
        area: { provinceId: '50', region: 1 },
      }).expect(400)) as {
        body: Refusal;
      };

      expect(body.errors[0].code).toBe('area_conflict');
    });
  });

  describe('duplicate suppression', () => {
    it('refuses a second submit from an IP with an unfinished Request, in friendly words and not as a rate limit', async () => {
      await post(valid).expect(201);

      const { body, status } = (await post(valid)) as {
        body: Refusal;
        status: number;
      };

      expect(status).toBe(409);
      expect(body.code).toBe('request_in_progress');
      expect(body.message).toMatch(/already have a request in progress/i);
      expect(JSON.stringify(body)).not.toMatch(/REQ-|rate|limit|too many/i);
      expect(await rows('SELECT 1 FROM request')).toHaveLength(1);
    });

    it('does not tell one person which Request is holding the IP', async () => {
      await post(valid).expect(201);

      const { text } = await post(valid);

      expect(text).not.toMatch(/REQ-\d/);
    });

    it('is per IP: another IP is unaffected', async () => {
      await post(valid, '10.0.0.1').expect(201);
      await post(valid, '10.0.0.2').expect(201);
    });

    it('lets the same IP submit again once the Request is finished', async () => {
      await post(valid).expect(201);
      await post(valid).expect(409);

      await db.owner.query(`UPDATE request SET state = 'rejected'`);

      await post(valid).expect(201);
    });

    it('still refuses while the Request is approved but not terminal', async () => {
      await post(valid).expect(201);
      await db.owner.query(`UPDATE request SET state = 'approved'`);

      await post(valid).expect(409);
    });

    it('catches a double-posted form: two simultaneous submits store one Request', async () => {
      const results = await Promise.all([post(valid), post(valid)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await rows('SELECT 1 FROM request')).toHaveLength(1);
    });

    it('does not count a refused invalid submit as a Request in progress', async () => {
      await post({ ...valid, diseaseGroupId: 'nope' }).expect(400);

      await post(valid).expect(201);
    });
  });

  describe('what the database refuses the application', () => {
    it('lets the application role neither update nor delete a contact record', async () => {
      await post(valid).expect(201);

      await expect(
        appPool.query(`UPDATE request_contact SET email = 'x'`),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        appPool.query('DELETE FROM request_contact'),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});
