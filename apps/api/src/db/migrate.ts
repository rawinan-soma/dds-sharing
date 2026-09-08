import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

export async function runMigrations(connectionString?: string) {
  // Migrations run DDL and create roles — always the DATABASE_URL superuser
  // connection, never createDb's own default (the restricted dds_app role).
  const { pool, db } = createDb(connectionString ?? process.env.DATABASE_URL);
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
