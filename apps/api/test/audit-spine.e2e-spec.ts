import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// The audit spine's guarantees live in the database, so they are asserted
// against a real, freshly migrated database rather than the Drizzle schema.
// Each run creates a throwaway database (roles are cluster-wide, so the
// application role is shared, which is exactly what production does).
const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/dds_sharing';

const APP_ROLE = 'dds_app';
const EVENT_TABLES = ['request_event', 'reviewer_event'] as const;

// Spelled out here on purpose, independent of the catalogue module: this is
// spec §12.4 transcribed, so a drift in either place fails the test.
const REQUEST_EVENT_TYPES = [
  'submitted',
  'probe_performed',
  'probe_failed',
  'approved',
  'rejected',
  'note_amended',
  'expired',
  'job_queued',
  'job_deferred_low_disk',
  'job_started',
  'code_fetched',
  'job_completed',
  'job_failed',
  'extraction_alert_raised',
  'extraction_alert_cleared',
  'extraction_rerun_queued',
  'mail_sent',
  'mail_send_failed',
  'mail_send_abandoned',
  'delivery_alert_raised',
  'download_attempted',
  'collection_lapse_raised',
  'collection_lapse_cleared',
  'download_token_revoked',
  'expired_uncollected',
  'object_deleted',
];

const REVIEWER_EVENT_TYPES = [
  'login_succeeded',
  'login_failed',
  'logged_out',
  'session_expired',
  'password_changed',
  'seeded',
  'totp_enrolled',
  'deactivated',
];

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const REVIEWER_ID = '22222222-2222-4222-8222-222222222222';

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

describe('audit spine (database)', () => {
  const databaseName = `audit_spine_${randomBytes(6).toString('hex')}`;
  let owner: Pool;
  let app: Client;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${databaseName}`);
    await admin.end();

    owner = new Pool({
      connectionString: withDatabase(ADMIN_URL, databaseName),
    });
    await migrate(drizzle(owner), {
      migrationsFolder: join(__dirname, '../src/db/migrations'),
    });

    // The event tables' reviewer_id is a real foreign key (§12.2): a
    // `reviewer` actor names a Reviewer that exists.
    await owner.query(
      `INSERT INTO reviewer (id, username, display_name, email, password_hash, totp_secret)
       VALUES ($1, 'audit.reviewer', 'Audit Reviewer', 'audit@example.go.th', 'x', 'x')`,
      [REVIEWER_ID],
    );

    // A second connection that acts as the application role. SET ROLE makes
    // every statement on it run under that role's privileges, so a refusal is
    // the database's, not the application's.
    app = new Client({
      connectionString: withDatabase(ADMIN_URL, databaseName),
    });
    await app.connect();
    await app.query(`SET ROLE ${APP_ROLE}`);
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await admin.end();
  });

  const insertRequestEvent = (
    overrides: Record<string, unknown> = {},
  ): Promise<unknown> => {
    const row = {
      request_id: REQUEST_ID,
      type: 'job_queued',
      actor_type: 'system',
      reviewer_id: null,
      ip: null,
      user_agent: null,
      occurred_at: new Date().toISOString(),
      payload: {},
      ...overrides,
    };
    return app.query(
      `INSERT INTO request_event
         (request_id, type, actor_type, reviewer_id, ip, user_agent, occurred_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        row.request_id,
        row.type,
        row.actor_type,
        row.reviewer_id,
        row.ip,
        row.user_agent,
        row.occurred_at,
        row.payload,
      ],
    );
  };

  const insertReviewerEvent = (
    overrides: Record<string, unknown> = {},
  ): Promise<unknown> => {
    const row = {
      type: 'seeded',
      actor_type: 'system',
      reviewer_id: null,
      ip: null,
      user_agent: null,
      occurred_at: new Date().toISOString(),
      payload: {},
      ...overrides,
    };
    return app.query(
      `INSERT INTO reviewer_event
         (type, actor_type, reviewer_id, ip, user_agent, occurred_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        row.type,
        row.actor_type,
        row.reviewer_id,
        row.ip,
        row.user_agent,
        row.occurred_at,
        row.payload,
      ],
    );
  };

  const enumLabels = async (table: string): Promise<string[]> => {
    const { rows } = await owner.query<{ labels: string[] }>(
      `SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_attribute a
         JOIN pg_enum e ON e.enumtypid = a.atttypid
        WHERE a.attrelid = $1::regclass AND a.attname = 'type'`,
      [table],
    );
    return rows[0].labels;
  };

  describe('shape', () => {
    it.each(EVENT_TABLES)(
      '%s orders by a bigserial and stores UTC timestamptz',
      async (table) => {
        const { rows } = await owner.query<{
          column_name: string;
          data_type: string;
          column_default: string | null;
        }>(
          `SELECT column_name, data_type, column_default
             FROM information_schema.columns
            WHERE table_name = $1`,
          [table],
        );
        const columns = Object.fromEntries(rows.map((r) => [r.column_name, r]));

        expect(columns.id.data_type).toBe('bigint');
        expect(columns.id.column_default).toMatch(/nextval/);
        expect(columns.occurred_at.data_type).toBe('timestamp with time zone');
        expect(columns.recorded_at.data_type).toBe('timestamp with time zone');
      },
    );

    it('keeps occurred_at and recorded_at as separate values', async () => {
      const occurred = '2026-01-01T00:00:00.000Z';
      await insertRequestEvent({ occurred_at: occurred });

      const { rows } = await owner.query<{
        occurred_at: Date;
        recorded_at: Date;
      }>(
        `SELECT occurred_at, recorded_at FROM request_event
          WHERE occurred_at = $1`,
        [occurred],
      );

      expect(rows[0].occurred_at.toISOString()).toBe(occurred);
      expect(rows[0].recorded_at.getTime()).toBeGreaterThan(
        rows[0].occurred_at.getTime(),
      );
    });

    it('refuses an event that does not say when it occurred', async () => {
      await expect(
        app.query(
          `INSERT INTO request_event (request_id, type, actor_type, payload)
           VALUES ($1, 'job_queued', 'system', '{}')`,
          [REQUEST_ID],
        ),
      ).rejects.toMatchObject({ code: '23502' });
    });

    it('answers "in what order" with the sequence even at one timestamp', async () => {
      const at = '2026-02-02T00:00:00.000Z';
      await insertRequestEvent({
        type: 'approved',
        actor_type: 'reviewer',
        reviewer_id: REVIEWER_ID,
        occurred_at: at,
      });
      await insertRequestEvent({ type: 'job_queued', occurred_at: at });

      const { rows } = await owner.query<{ type: string }>(
        `SELECT type FROM request_event WHERE occurred_at = $1 ORDER BY id`,
        [at],
      );

      expect(rows.map((r) => r.type)).toEqual(['approved', 'job_queued']);
    });
  });

  describe('closed catalogue', () => {
    it('request_event holds the full §12.4 catalogue and nothing beyond it', async () => {
      expect(await enumLabels('request_event')).toEqual(REQUEST_EVENT_TYPES);
    });

    it('reviewer_event holds the eight §12.4 types and nothing beyond them', async () => {
      expect(await enumLabels('reviewer_event')).toEqual(REVIEWER_EVENT_TYPES);
    });

    it.each(['mail_bounced', 'contact_redacted'])(
      'has no %s type in either table',
      async (forbidden) => {
        expect(await enumLabels('request_event')).not.toContain(forbidden);
        expect(await enumLabels('reviewer_event')).not.toContain(forbidden);
        await expect(
          insertRequestEvent({ type: forbidden }),
        ).rejects.toMatchObject({ code: '22P02' });
      },
    );
  });

  describe('discriminated actor', () => {
    it('accepts a reviewer actor with a reviewer id', async () => {
      await expect(
        insertRequestEvent({
          type: 'rejected',
          actor_type: 'reviewer',
          reviewer_id: REVIEWER_ID,
        }),
      ).resolves.toBeDefined();
    });

    it('refuses a reviewer actor without a reviewer id', async () => {
      await expect(
        insertRequestEvent({ type: 'rejected', actor_type: 'reviewer' }),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it.each(['requester', 'system', 'anonymous'])(
      'refuses a reviewer id on a %s actor',
      async (actor) => {
        await expect(
          insertRequestEvent({ actor_type: actor, reviewer_id: REVIEWER_ID }),
        ).rejects.toMatchObject({ code: '23514' });
      },
    );

    it.each(['requester', 'anonymous'])(
      'accepts ip and user agent on the unauthenticated %s actor',
      async (actor) => {
        await expect(
          insertRequestEvent({
            type: 'submitted',
            actor_type: actor,
            ip: '203.0.113.9',
            user_agent: 'test-agent',
          }),
        ).resolves.toBeDefined();
      },
    );

    it.each(['reviewer', 'system'])(
      'refuses ip or user agent on a %s actor',
      async (actor) => {
        const reviewer_id = actor === 'reviewer' ? REVIEWER_ID : null;
        await expect(
          insertRequestEvent({
            actor_type: actor,
            reviewer_id,
            ip: '203.0.113.9',
          }),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          insertRequestEvent({
            actor_type: actor,
            reviewer_id,
            user_agent: 'test-agent',
          }),
        ).rejects.toMatchObject({ code: '23514' });
      },
    );

    it('applies the same actor rules to reviewer_event', async () => {
      await expect(
        insertReviewerEvent({
          type: 'login_succeeded',
          actor_type: 'reviewer',
          reviewer_id: REVIEWER_ID,
        }),
      ).resolves.toBeDefined();
      await expect(
        insertReviewerEvent({
          type: 'login_failed',
          actor_type: 'anonymous',
          ip: '203.0.113.9',
          user_agent: 'test-agent',
        }),
      ).resolves.toBeDefined();
      await expect(
        insertReviewerEvent({
          type: 'login_succeeded',
          actor_type: 'reviewer',
        }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        insertReviewerEvent({ actor_type: 'system', ip: '203.0.113.9' }),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('immutability, enforced by the application role', () => {
    beforeEach(async () => {
      await insertRequestEvent();
      await insertReviewerEvent();
    });

    it.each(EVENT_TABLES)('can INSERT and SELECT on %s', async (table) => {
      const { rows } = await app.query(`SELECT id FROM ${table} LIMIT 1`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it.each(EVENT_TABLES)(
      'holds exactly INSERT and SELECT on %s',
      async (table) => {
        const { rows } = await owner.query<{ privilege_type: string }>(
          `SELECT privilege_type FROM information_schema.table_privileges
          WHERE table_name = $1 AND grantee = $2
          ORDER BY privilege_type`,
          [table, APP_ROLE],
        );
        expect(rows.map((r) => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
      },
    );

    it.each(EVENT_TABLES)(
      'fails DELETE on %s as the application role',
      async (table) => {
        await expect(app.query(`DELETE FROM ${table}`)).rejects.toMatchObject({
          code: '42501',
        });
      },
    );

    it.each(EVENT_TABLES)(
      'fails UPDATE on %s as the application role',
      async (table) => {
        await expect(
          app.query(`UPDATE ${table} SET payload = '{"edited":true}'`),
        ).rejects.toMatchObject({ code: '42501' });
      },
    );

    it.each(EVENT_TABLES)(
      'fails TRUNCATE on %s as the application role',
      async (table) => {
        await expect(app.query(`TRUNCATE ${table}`)).rejects.toMatchObject({
          code: '42501',
        });
      },
    );

    it('leaves the rows in place after the refused statements', async () => {
      const { rows } = await owner.query(`SELECT 1 FROM request_event`);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('no admin role', () => {
    it.each(EVENT_TABLES)(
      'grants %s only to its owner and the application role',
      async (table) => {
        const { rows } = await owner.query<{ grantee: string }>(
          `SELECT DISTINCT grantee FROM information_schema.table_privileges
            WHERE table_name = $1`,
          [table],
        );
        const { rows: ownerRows } = await owner.query<{ tableowner: string }>(
          `SELECT tableowner FROM pg_tables WHERE tablename = $1`,
          [table],
        );

        expect(rows.map((r) => r.grantee).sort()).toEqual(
          [ownerRows[0].tableowner, APP_ROLE].sort(),
        );
      },
    );

    it('creates no role whose name says admin', async () => {
      const { rows } = await owner.query(
        `SELECT rolname FROM pg_roles WHERE rolname ILIKE '%admin%'`,
      );
      expect(rows).toEqual([]);
    });
  });
});
