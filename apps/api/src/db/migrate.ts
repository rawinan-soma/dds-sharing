import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

// drizzle-orm's migrator has no locking of its own: it reads the last
// applied migration and then applies pending ones in a transaction, with no
// guard between the read and the write. Two concurrent callers against the
// same fresh database (e.g. migrate.spec.ts and another spec's beforeAll,
// both hitting the CI Postgres service in parallel) can both see "nothing
// applied yet" and race to CREATE TABLE. A session-level advisory lock,
// held on a dedicated connection for the whole migration, serializes any
// number of concurrent runMigrations() callers against one database.
const MIGRATION_ADVISORY_LOCK_KEY = 847_362_910_123n;

export async function runMigrations(connectionString?: string) {
  const { pool, db } = createDb(connectionString);
  const lockClient = new Client({
    connectionString: connectionString ?? process.env.DATABASE_URL,
  });
  await lockClient.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    await migrate(db, {
      migrationsFolder: new URL("../../drizzle/migrations", import.meta.url)
        .pathname,
    });
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    await lockClient.end();
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runMigrations();
}
