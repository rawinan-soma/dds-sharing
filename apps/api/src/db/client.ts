import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

// Defaults to APP_DATABASE_URL — the restricted dds_app role (§12.2) — because
// this is what application code connects with at runtime. Migrations need
// DDL/role privileges the app role must never hold, so migrate.ts passes its
// own DATABASE_URL connection explicitly rather than relying on this default.
export function createDb(connectionString = process.env.APP_DATABASE_URL) {
  const pool = new Pool({ connectionString });
  return { pool, db: drizzle(pool, { schema }) };
}
