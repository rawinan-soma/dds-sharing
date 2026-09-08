import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrate.js";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("runMigrations", () => {
  it("applies cleanly on a fresh volume, and again on a migrated one", async () => {
    await expect(runMigrations(connectionString)).resolves.not.toThrow();
    await expect(runMigrations(connectionString)).resolves.not.toThrow();

    const pool = new Pool({ connectionString });
    try {
      const result = await pool.query(
        "select to_regclass('drizzle.__drizzle_migrations') as table_name",
      );
      expect(result.rows[0].table_name).toBe("drizzle.__drizzle_migrations");
    } finally {
      await pool.end();
    }
  });
});
