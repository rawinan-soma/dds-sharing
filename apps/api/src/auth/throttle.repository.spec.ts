import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { isThrottled, recordThrottleFailure, resetThrottle, accountThrottleKey, ipThrottleKey } from "./throttle.repository.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("throttle.repository (spec §17.5: no lockout, throttling only, Postgres-backed)", () => {
  let admin: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    admin = createDb(adminUrl);
    app = createDb(appUrl);
  });

  afterAll(async () => {
    await admin.pool.end();
    await app.pool.end();
  });

  beforeEach(async () => {
    await admin.pool.query('TRUNCATE TABLE "reviewer_login_throttle" CASCADE');
  });

  it("is not throttled before any failure is recorded", async () => {
    expect(await isThrottled(app.db, accountThrottleKey("nobody-yet"))).toBe(false);
  });

  it("throttles a key immediately after one failure", async () => {
    const key = accountThrottleKey("alice");
    await recordThrottleFailure(app.db, key);
    expect(await isThrottled(app.db, key)).toBe(true);
  });

  it("keeps the account key and the IP key independent", async () => {
    await recordThrottleFailure(app.db, accountThrottleKey("bob"));
    expect(await isThrottled(app.db, ipThrottleKey("9.9.9.9"))).toBe(false);
  });

  it("clears on reset, as on a successful sign-in", async () => {
    const key = accountThrottleKey("carol");
    await recordThrottleFailure(app.db, key);
    await resetThrottle(app.db, key);
    expect(await isThrottled(app.db, key)).toBe(false);
  });

  it("survives being read back from a fresh connection — state is Postgres, not an in-process cache", async () => {
    const key = accountThrottleKey("dave");
    await recordThrottleFailure(app.db, key);

    const { db: freshDb, pool: freshPool } = createDb(appUrl);
    try {
      expect(await isThrottled(freshDb, key)).toBe(true);
    } finally {
      await freshPool.end();
    }
  });

  it("advances the delay on repeated failures rather than ever locking the key out", async () => {
    const key = accountThrottleKey("erin");
    for (let i = 0; i < 3; i++) {
      await recordThrottleFailure(app.db, key);
    }
    const row = await admin.pool.query(
      `SELECT failure_count, next_allowed_at FROM reviewer_login_throttle WHERE key = $1`,
      [key],
    );
    expect(row.rows[0].failure_count).toBe(3);
    expect(new Date(row.rows[0].next_allowed_at).getTime()).toBeGreaterThan(Date.now());
  });
});
