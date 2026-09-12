import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { insertReviewer, findReviewerByUsername } from "../src/auth/reviewer.repository.js";
import { createSession, validateAndTouchSession } from "../src/auth/session.repository.js";
import { deactivateReviewerCli, MINIMUM_ACTIVE_REVIEWERS } from "./reviewer-deactivate.js";

const adminUrl = process.env.DATABASE_URL;

async function seed(db: ReturnType<typeof createDb>["db"], username: string) {
  return insertReviewer(db, { username, displayName: `${username} display`, passwordHash: "hash", totpSecret: "SECRET" });
}

describe.skipIf(!adminUrl)("deactivateReviewerCli (spec §17.5: the two-active-reviewer floor)", () => {
  let admin: ReturnType<typeof createDb>;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    admin = createDb(adminUrl);
  });

  afterAll(async () => {
    await admin.pool.end();
  });

  beforeEach(async () => {
    await admin.pool.query('TRUNCATE TABLE "reviewer" CASCADE');
    await admin.pool.query('TRUNCATE TABLE "reviewer_event" CASCADE');
    await admin.pool.query('TRUNCATE TABLE "reviewer_session" CASCADE');
  });

  it("reports not_found for an unknown username", async () => {
    const result = await deactivateReviewerCli(admin.db, { username: "nobody", operator: "ops", force: false });
    expect(result).toEqual({ outcome: "not_found" });
  });

  it("refuses to go below the minimum without --force", async () => {
    const a = await seed(admin.db, "alpha");
    await seed(admin.db, "bravo"); // exactly two active

    const result = await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops", force: false });
    expect(result).toEqual({ outcome: "refused_below_minimum", remainingActive: 1 });

    const stillActive = await findReviewerByUsername(admin.db, "alpha");
    expect(stillActive?.deactivatedAt).toBeNull();
  });

  it(`proceeds when at least ${MINIMUM_ACTIVE_REVIEWERS} would remain active`, async () => {
    const a = await seed(admin.db, "charlie");
    await seed(admin.db, "delta");
    await seed(admin.db, "echo");

    const result = await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops", force: false });
    expect(result).toEqual({ outcome: "deactivated" });
  });

  it("proceeds below the minimum only with --force, and records that it was forced", async () => {
    const a = await seed(admin.db, "foxtrot");
    await seed(admin.db, "golf");

    const result = await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops-bob", force: true });
    expect(result).toEqual({ outcome: "deactivated" });

    const events = await admin.pool.query(`SELECT type, payload FROM reviewer_event WHERE reviewer_id = $1`, [a.id]);
    expect(events.rows).toEqual([{ type: "deactivated", payload: { operator: "ops-bob", force: true } }]);
  });

  it("sets deactivated_at and never deletes the row", async () => {
    const a = await seed(admin.db, "hotel");
    await seed(admin.db, "india");
    await seed(admin.db, "juliet");

    await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops", force: false });
    const after = await findReviewerByUsername(admin.db, "hotel");
    expect(after).toBeDefined();
    expect(after!.deactivatedAt).not.toBeNull();
  });

  it("invalidates every live session for the Reviewer immediately", async () => {
    const a = await seed(admin.db, "kilo");
    await seed(admin.db, "lima");
    await seed(admin.db, "mike");
    const session = await createSession(admin.db, a.id);

    await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops", force: false });

    expect(await validateAndTouchSession(admin.db, session.token)).toEqual({ outcome: "not_found" });
  });

  it("reports already_deactivated rather than double-processing", async () => {
    const a = await seed(admin.db, "november");
    await seed(admin.db, "oscar");
    await seed(admin.db, "papa");
    await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops", force: false });

    const second = await deactivateReviewerCli(admin.db, { username: a.username, operator: "ops", force: false });
    expect(second).toEqual({ outcome: "already_deactivated" });
  });
});
