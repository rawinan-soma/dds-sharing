import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

export interface ScratchDatabase {
  /** Owner connection: migrates, and may tamper with the data. */
  ownerUrl: string;
  /** A login that is only a member of dds_app, as the application connects. */
  appUrl: string;
  owner: Pool;
  drop(): Promise<void>;
}

// An arbitrary key, unique to this lock; the app's own advisory locks
// (pg_advisory_xact_lock in reviewer-accounts and requests) use other keys.
const MIGRATION_LOCK = 6_425_001;

/**
 * Migrates a test database. dds_app is a cluster-wide role and the migration
 * creates it with a check-then-create, which races when test files migrate in
 * parallel; an advisory lock (held on its own connection) serialises them
 * across files and worker processes.
 */
export async function migrateSerialised(
  adminUrl: string,
  owner: Pool,
): Promise<void> {
  const lock = new Client({ connectionString: adminUrl });
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await migrate(drizzle(owner), {
      migrationsFolder: join(__dirname, '../../src/db/migrations'),
    });
  } finally {
    await lock.end();
  }
}

const withDatabase = (
  url: string,
  database: string,
  auth?: [string, string],
) => {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (auth) [u.username, u.password] = auth;
  return u.toString();
};

// A throwaway database per test file, migrated from the checked-in migrations
// and reached the way production reaches it: migrations as the owner, the
// application as a member of dds_app.
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL must be set to run e2e tests');

  const suffix = randomBytes(4).toString('hex');
  const name = `dds_test_${suffix}`;
  const login = `dds_app_login_${suffix}`;
  const password = 'test';

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);

  const ownerUrl = withDatabase(adminUrl, name);
  const owner = new Pool({ connectionString: ownerUrl });
  // DROP ... WITH (FORCE) can reach a connection that is still closing.
  owner.on('error', () => {});
  await migrateSerialised(adminUrl, owner);
  await admin.query(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}'`);
  await admin.query(`GRANT dds_app TO "${login}"`);
  await admin.query(`GRANT CONNECT ON DATABASE "${name}" TO "${login}"`);

  return {
    ownerUrl,
    appUrl: withDatabase(adminUrl, name, [login, password]),
    owner,
    async drop() {
      await owner.end();
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.query(`DROP ROLE "${login}"`);
      await admin.end();
    },
  };
}
