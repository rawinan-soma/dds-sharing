import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { verifyPassword } from "../src/auth/password-hash.js";
import { checkPasswordPolicy } from "../src/auth/password-policy.js";
import { findReviewerByUsername } from "../src/auth/reviewer.repository.js";
import { seedReviewer } from "./reviewer-seed.js";

const adminUrl = process.env.DATABASE_URL;

describe.skipIf(!adminUrl)("seedReviewer (spec §17.5: the seeding ceremony)", () => {
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
  });

  it("seeds an inert account with a policy-compliant one-time password and a SHA-1/6/30 enrolment URI", async () => {
    const result = await seedReviewer(admin.db, {
      username: "pat",
      displayName: "Pat Reviewer",
      operator: "ci-operator",
    });

    expect(checkPasswordPolicy(result.password)).toEqual([]);
    expect(result.provisioningUri).toContain("algorithm=SHA1");
    expect(result.provisioningUri).toContain("digits=6");
    expect(result.provisioningUri).toContain("period=30");

    const reviewer = await findReviewerByUsername(admin.db, "pat");
    expect(reviewer).toBeDefined();
    expect(reviewer!.displayName).toBe("Pat Reviewer");
    expect(reviewer!.totpConfirmedAt).toBeNull();
    expect(reviewer!.mustChangePassword).toBe(true);
    await expect(verifyPassword(reviewer!.passwordHash, result.password)).resolves.toBe(true);
  });

  it("prompts for display_name rather than deriving it from the username", async () => {
    const result = await seedReviewer(admin.db, {
      username: "quinn",
      displayName: "Dr. Quinn Somsak",
      operator: "ci-operator",
    });
    expect(result.displayName).toBe("Dr. Quinn Somsak");
    expect(result.displayName).not.toBe(result.username);
  });

  it("records the seeded event naming the operator", async () => {
    await seedReviewer(admin.db, { username: "riley", displayName: "Riley Reviewer", operator: "ops-alice" });
    const events = await admin.pool.query(`SELECT type, payload FROM reviewer_event`);
    expect(events.rows).toEqual([{ type: "seeded", payload: { operator: "ops-alice" } }]);
  });

  it("never records the generated password anywhere", async () => {
    const result = await seedReviewer(admin.db, { username: "sam", displayName: "Sam Reviewer", operator: "ci-operator" });
    const events = await admin.pool.query(`SELECT payload::text AS payload FROM reviewer_event`);
    for (const row of events.rows) {
      expect(row.payload).not.toContain(result.password);
    }
  });
});
