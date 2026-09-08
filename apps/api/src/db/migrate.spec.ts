import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrate.js";
import { APP_ROLE, ADMIN_ROLE, connectAs } from "./roles.js";

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

// §12.2: "enforced by database roles, not by convention" — this must be
// checked at the database, as a different role, not by asserting the
// application never issues the query.
describe.skipIf(!connectionString)("event table role enforcement (§12.2)", () => {
  beforeAll(async () => {
    await runMigrations(connectionString);
  });

  it.each([
    ["dds_app", APP_ROLE],
    ["dds_admin", ADMIN_ROLE],
  ])("%s can INSERT and SELECT on the event tables, but not UPDATE or DELETE", async (_name, role) => {
    const pool = new Pool({ connectionString: connectAs(connectionString!, role) });
    try {
      await expect(
        pool.query(
          `INSERT INTO request_event (request_id, type, actor_type, ip, user_agent, payload, occurred_at)
           VALUES (gen_random_uuid(), 'submitted', 'requester', '127.0.0.1', 'curl/8.0', '{}'::jsonb, now())`,
        ),
      ).resolves.toBeDefined();
      await expect(pool.query(`SELECT count(*) FROM request_event`)).resolves.toBeDefined();

      await expect(pool.query(`UPDATE request_event SET payload = payload`)).rejects.toThrow(
        /permission denied/i,
      );
      await expect(pool.query(`DELETE FROM request_event`)).rejects.toThrow(/permission denied/i);

      await expect(
        pool.query(
          `INSERT INTO reviewer_event (reviewer_id, type, payload, occurred_at)
           VALUES (gen_random_uuid(), 'login_succeeded', '{}'::jsonb, now())`,
        ),
      ).resolves.toBeDefined();
      await expect(pool.query(`SELECT count(*) FROM reviewer_event`)).resolves.toBeDefined();

      await expect(pool.query(`UPDATE reviewer_event SET payload = payload`)).rejects.toThrow(
        /permission denied/i,
      );
      await expect(pool.query(`DELETE FROM reviewer_event`)).rejects.toThrow(/permission denied/i);
    } finally {
      await pool.end();
    }
  });
});

// §12.2: "which human did this" must never be a query with a plausible wrong
// answer available — the discriminated-actor invariant is a CHECK constraint,
// not just a TypeScript type.
describe.skipIf(!connectionString)("request_event discriminated actor (§12.2)", () => {
  beforeAll(async () => {
    await runMigrations(connectionString);
  });

  const insert = (pool: Pool, fields: Record<string, string>) =>
    pool.query(
      `INSERT INTO request_event (request_id, type, actor_type, reviewer_id, ip, user_agent, occurred_at)
       VALUES (gen_random_uuid(), 'submitted', $1, $2, $3, $4, now())`,
      [fields.actorType, fields.reviewerId ?? null, fields.ip ?? null, fields.userAgent ?? null],
    );

  it("rejects a reviewer_id on a non-reviewer actor", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(
        insert(pool, { actorType: "system", reviewerId: "11111111-1111-1111-1111-111111111111" }),
      ).rejects.toThrow(/violates check constraint/i);
    } finally {
      await pool.end();
    }
  });

  it("rejects a reviewer actor with no reviewer_id", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(insert(pool, { actorType: "reviewer" })).rejects.toThrow(
        /violates check constraint/i,
      );
    } finally {
      await pool.end();
    }
  });

  it("accepts a reviewer actor with reviewer_id set", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(
        insert(pool, { actorType: "reviewer", reviewerId: "11111111-1111-1111-1111-111111111111" }),
      ).resolves.toBeDefined();
    } finally {
      await pool.end();
    }
  });

  it("rejects ip or user_agent on a reviewer or system actor", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(insert(pool, { actorType: "system", ip: "127.0.0.1" })).rejects.toThrow(
        /violates check constraint/i,
      );
      await expect(insert(pool, { actorType: "reviewer", userAgent: "curl/8.0" })).rejects.toThrow(
        /violates check constraint/i,
      );
    } finally {
      await pool.end();
    }
  });

  it("rejects a requester or anonymous actor missing ip or user_agent", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(insert(pool, { actorType: "requester", ip: "127.0.0.1" })).rejects.toThrow(
        /violates check constraint/i,
      );
      await expect(insert(pool, { actorType: "anonymous", userAgent: "curl/8.0" })).rejects.toThrow(
        /violates check constraint/i,
      );
      await expect(insert(pool, { actorType: "requester" })).rejects.toThrow(
        /violates check constraint/i,
      );
    } finally {
      await pool.end();
    }
  });

  it("accepts ip and user_agent together on the unauthenticated actor kinds", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(
        insert(pool, { actorType: "requester", ip: "127.0.0.1", userAgent: "curl/8.0" }),
      ).resolves.toBeDefined();
      await expect(
        insert(pool, { actorType: "anonymous", ip: "127.0.0.1", userAgent: "curl/8.0" }),
      ).resolves.toBeDefined();
    } finally {
      await pool.end();
    }
  });

  it("accepts a system actor with no reviewer_id, ip or user_agent", async () => {
    const pool = new Pool({ connectionString });
    try {
      await expect(insert(pool, { actorType: "system" })).resolves.toBeDefined();
    } finally {
      await pool.end();
    }
  });
});
