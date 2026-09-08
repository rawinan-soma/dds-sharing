import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

export async function runMigrations(connectionString?: string) {
  const { pool, db } = createDb(connectionString);
  try {
    await migrate(db, {
      migrationsFolder: new URL("../../drizzle/migrations", import.meta.url).pathname,
    });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runMigrations();
}
