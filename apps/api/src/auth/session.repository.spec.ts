import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { insertReviewer } from "./reviewer.repository.js";
import {
  createSession,
  validateAndTouchSession,
  deleteSession,
  deleteAllSessionsForReviewer,
  SESSION_MAX_CONCURRENT,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_ABSOLUTE_CEILING_MS,
} from "./session.repository.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("session.repository (spec §17.5: sliding idle inside a fixed ceiling)", () => {
  let admin: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let reviewerId: string;
  let otherReviewerId: string;

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
    await admin.pool.query('TRUNCATE TABLE "reviewer" CASCADE');
    await admin.pool.query('TRUNCATE TABLE "reviewer_session" CASCADE');
    const reviewer = await insertReviewer(admin.db, {
      username: "sessions-reviewer",
      displayName: "Sessions Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    reviewerId = reviewer.id;
    const otherReviewer = await insertReviewer(admin.db, {
      username: "sessions-reviewer-other",
      displayName: "Other Sessions Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    otherReviewerId = otherReviewer.id;
    vi.useRealTimers();
  });

  it("creates a session whose absolute ceiling is 6 hours out, and validates it", async () => {
    const { token, absoluteExpiresAt } = await createSession(app.db, reviewerId, { ip: "1.2.3.4", userAgent: "curl" });
    expect(absoluteExpiresAt.getTime() - Date.now()).toBeCloseTo(SESSION_ABSOLUTE_CEILING_MS, -3);

    const result = await validateAndTouchSession(app.db, token);
    expect(result).toMatchObject({ outcome: "valid", reviewerId });
  });

  it("rejects an unknown token", async () => {
    const result = await validateAndTouchSession(app.db, "not-a-real-token");
    expect(result).toEqual({ outcome: "not_found" });
  });

  it("expires idle sessions after the 1-hour sliding window, without touching the absolute ceiling", async () => {
    const { token } = await createSession(app.db, reviewerId);
    // Backdate lastSeenAt past the idle timeout, but still well inside the 6h ceiling.
    await admin.pool.query(
      `UPDATE reviewer_session SET last_seen_at = now() - interval '${SESSION_IDLE_TIMEOUT_MS / 1000 + 5} seconds' WHERE reviewer_id = $1`,
      [reviewerId],
    );
    const result = await validateAndTouchSession(app.db, token);
    expect(result).toEqual({ outcome: "expired", reviewerId, reason: "idle_timeout" });

    // and the row is gone
    expect(await validateAndTouchSession(app.db, token)).toEqual({ outcome: "not_found" });
  });

  it("expires at the absolute ceiling even if the session was just touched", async () => {
    const { token } = await createSession(app.db, reviewerId);
    await admin.pool.query(
      `UPDATE reviewer_session SET last_seen_at = now(), absolute_expires_at = now() - interval '1 second' WHERE reviewer_id = $1`,
      [reviewerId],
    );
    const result = await validateAndTouchSession(app.db, token);
    expect(result).toEqual({ outcome: "expired", reviewerId, reason: "absolute_ceiling" });
  });

  it("sliding a session never rewrites its absolute ceiling", async () => {
    const { token, absoluteExpiresAt } = await createSession(app.db, reviewerId);
    const result = await validateAndTouchSession(app.db, token);
    expect(result).toMatchObject({ outcome: "valid" });
    if (result.outcome === "valid") {
      expect(result.absoluteExpiresAt.getTime()).toBe(absoluteExpiresAt.getTime());
    }
  });

  it(`caps concurrent sessions at ${SESSION_MAX_CONCURRENT} per Reviewer, evicting the oldest`, async () => {
    const tokens: string[] = [];
    for (let i = 0; i < SESSION_MAX_CONCURRENT + 2; i++) {
      const { token } = await createSession(app.db, reviewerId);
      tokens.push(token);
    }
    const results = await Promise.all(tokens.map((token) => validateAndTouchSession(app.db, token)));
    const liveCount = results.filter((r) => r.outcome === "valid").length;
    expect(liveCount).toBe(SESSION_MAX_CONCURRENT);
    // the earliest-created sessions are the ones evicted
    expect(results[0]!.outcome).toBe("not_found");
    expect(results[1]!.outcome).toBe("not_found");
  });

  it("evicting one Reviewer's oldest session never touches another Reviewer's live sessions", async () => {
    const other = await createSession(app.db, otherReviewerId);

    for (let i = 0; i < SESSION_MAX_CONCURRENT + 1; i++) {
      await createSession(app.db, reviewerId);
    }

    expect(await validateAndTouchSession(app.db, other.token)).toMatchObject({
      outcome: "valid",
      reviewerId: otherReviewerId,
    });
  });

  it("deletes a single session on logout", async () => {
    const { token } = await createSession(app.db, reviewerId);
    await deleteSession(app.db, token);
    expect(await validateAndTouchSession(app.db, token)).toEqual({ outcome: "not_found" });
  });

  it("deactivation invalidates every live session for the Reviewer immediately", async () => {
    const first = await createSession(app.db, reviewerId);
    const second = await createSession(app.db, reviewerId);
    await deleteAllSessionsForReviewer(app.db, reviewerId);
    expect(await validateAndTouchSession(app.db, first.token)).toEqual({ outcome: "not_found" });
    expect(await validateAndTouchSession(app.db, second.token)).toEqual({ outcome: "not_found" });
  });
});
