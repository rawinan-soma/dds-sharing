import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolve } from 'node:path';

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  await client.end();
}

// Also runnable directly — `pnpm --filter server run migrate` — for a manual
// or CI-driven apply, separate from the automatic run at boot in main.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL must be set');
    process.exit(1);
  }
  await runMigrations(databaseUrl);
  console.log('Migrations applied.');
}
