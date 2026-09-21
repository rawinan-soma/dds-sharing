import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { migrationSchema, validateEnvOrExit } from '../config/env.schema';

async function main() {
  // Before anything connects: no fallback, so a missing URL cannot migrate the
  // wrong database.
  const { DATABASE_URL: connectionString } = validateEnvOrExit(migrationSchema);

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });

  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
