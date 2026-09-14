import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import {
  findReviewerByUsername,
  insertReviewer,
  confirmTotpEnrolment,
  recordTotpStepUsed,
  updatePasswordHash,
  deactivateReviewer,
  countActiveReviewers,
  countOtherActiveReviewers,
  isActive,
} from "./reviewer.repository.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("reviewer.repository (spec §17.5)", () => {
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
    await admin.pool.query('TRUNCATE TABLE "reviewer" CASCADE');
  });

  it("seeds a Reviewer as inert — no TOTP confirmation, must-change-password set", async () => {
    const reviewer = await insertReviewer(admin.db, {
      username: "alice",
      displayName: "Alice Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    expect(reviewer.totpConfirmedAt).toBeNull();
    expect(reviewer.mustChangePassword).toBe(true);
    expect(reviewer.deactivatedAt).toBeNull();
  });

  it("finds a seeded Reviewer by username through the app-role connection", async () => {
    await insertReviewer(admin.db, {
      username: "bob",
      displayName: "Bob Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    const found = await findReviewerByUsername(app.db, "bob");
    expect(found?.displayName).toBe("Bob Reviewer");
  });

  it("app_role cannot INSERT a new Reviewer — seeding is CLI/admin-only", async () => {
    await expect(
      insertReviewer(app.db, { username: "mallory", displayName: "M", passwordHash: "h", totpSecret: "S" }),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/i) } });
  });

  it("confirms TOTP enrolment and records replay-protection state through app_role", async () => {
    const reviewer = await insertReviewer(admin.db, {
      username: "carol",
      displayName: "Carol Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    await confirmTotpEnrolment(app.db, reviewer.id);
    await recordTotpStepUsed(app.db, reviewer.id, 12345);

    const updated = await findReviewerByUsername(app.db, "carol");
    expect(updated?.totpConfirmedAt).not.toBeNull();
    expect(updated?.totpLastUsedStep).toBe(12345);
  });

  it("changes a password and clears must-change-password through app_role", async () => {
    const reviewer = await insertReviewer(admin.db, {
      username: "dave",
      displayName: "Dave Reviewer",
      passwordHash: "old-hash",
      totpSecret: "SECRET",
    });
    await updatePasswordHash(app.db, reviewer.id, "new-hash");
    const updated = await findReviewerByUsername(app.db, "dave");
    expect(updated?.passwordHash).toBe("new-hash");
    expect(updated?.mustChangePassword).toBe(false);
  });

  it("app_role cannot deactivate a Reviewer — that column is excluded from its UPDATE grant", async () => {
    const reviewer = await insertReviewer(admin.db, {
      username: "erin",
      displayName: "Erin Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    await expect(deactivateReviewer(app.db, reviewer.id)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/permission denied/i) },
    });
  });

  it("deactivation sets deactivated_at and never deletes the row", async () => {
    const reviewer = await insertReviewer(admin.db, {
      username: "frank",
      displayName: "Frank Reviewer",
      passwordHash: "hash",
      totpSecret: "SECRET",
    });
    await deactivateReviewer(admin.db, reviewer.id);
    const after = await findReviewerByUsername(app.db, "frank");
    expect(after).toBeDefined();
    expect(after?.deactivatedAt).not.toBeNull();
    expect(isActive(after!)).toBe(false);
  });

  it("counts active reviewers, and active reviewers other than a given one", async () => {
    const a = await insertReviewer(admin.db, { username: "g1", displayName: "G1", passwordHash: "h", totpSecret: "S" });
    await insertReviewer(admin.db, { username: "g2", displayName: "G2", passwordHash: "h", totpSecret: "S" });
    const g3 = await insertReviewer(admin.db, { username: "g3", displayName: "G3", passwordHash: "h", totpSecret: "S" });
    await deactivateReviewer(admin.db, g3.id);

    expect(await countActiveReviewers(admin.db)).toBe(2);
    expect(await countOtherActiveReviewers(admin.db, a.id)).toBe(1);
  });
});
