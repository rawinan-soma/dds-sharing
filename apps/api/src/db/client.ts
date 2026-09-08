import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export function createDb(connectionString = process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString });
  return { pool, db: drizzle(pool, { schema }) };
}
