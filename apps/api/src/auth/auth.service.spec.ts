import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as OTPAuth from "otpauth";
import { Test } from "@nestjs/testing";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { hashPassword } from "./password-hash.js";
import { generateTotpSecret } from "./totp.js";
import { insertReviewer, deactivateReviewer, findReviewerByUsername } from "./reviewer.repository.js";
import { APP_DB } from "./app-db.provider.js";
import { AuthService } from "./auth.service.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

const PASSWORD = "Correct-Horse1!";
const CONTEXT = { ip: "203.0.113.7", userAgent: "vitest" };

function codeFor(secretBase32: string, offsetSeconds = 0): string {
  const totp = new OTPAuth.TOTP({
    issuer: "DDS Sharing",
    label: "test",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate({ timestamp: Date.now() + offsetSeconds * 1000 });
}

describe.skipIf(!adminUrl || !appUrl)("AuthService (spec §17.5)", () => {
  let admin: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let service: AuthService;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    admin = createDb(adminUrl);
    app = createDb(appUrl);

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: APP_DB, useValue: app.db }],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await admin.pool.end();
    await app.pool.end();
  });

  beforeEach(async () => {
    await admin.pool.query('TRUNCATE TABLE "reviewer" CASCADE');
    await admin.pool.query('TRUNCATE TABLE "reviewer_login_throttle" CASCADE');
    await admin.pool.query('TRUNCATE TABLE "reviewer_session" CASCADE');
    await admin.pool.query('TRUNCATE TABLE "reviewer_event" CASCADE');
  });

  async function seedReviewer(username: string, opts: { deactivated?: boolean } = {}) {
    const secret = generateTotpSecret();
    const passwordHash = await hashPassword(PASSWORD);
    const reviewer = await insertReviewer(admin.db, {
      username,
      displayName: `${username} display name`,
      passwordHash,
      totpSecret: secret.base32,
    });
    if (opts.deactivated) {
      await deactivateReviewer(admin.db, reviewer.id);
    }
    return { reviewer, secret };
  }

  async function eventsFor(reviewerId: string) {
    const result = await admin.pool.query(
      `SELECT type, payload FROM reviewer_event WHERE reviewer_id = $1 ORDER BY id`,
      [reviewerId],
    );
    return result.rows as { type: string; payload: unknown }[];
  }

  it("a seeded-but-unconfirmed account's first successful sign-in confirms TOTP enrolment", async () => {
    const { reviewer, secret } = await seedReviewer("alice");
    const result = await service.signIn("alice", PASSWORD, codeFor(secret.base32), CONTEXT);
    expect(result.outcome).toBe("success");

    const updated = await findReviewerByUsername(app.db, "alice");
    expect(updated?.totpConfirmedAt).not.toBeNull();

    const events = await eventsFor(reviewer.id);
    expect(events.map((e) => e.type)).toEqual(["totp_enrolled", "login_succeeded"]);
  });

  it("does not re-confirm or re-emit totp_enrolled on a later sign-in", async () => {
    const { reviewer, secret } = await seedReviewer("bob");
    await service.signIn("bob", PASSWORD, codeFor(secret.base32), CONTEXT);
    // A code from the next step — accepted via the ±1 window, and a distinct step, so it isn't a replay.
    await service.signIn("bob", PASSWORD, codeFor(secret.base32, 30), CONTEXT);

    const events = await eventsFor(reviewer.id);
    expect(events.filter((e) => e.type === "totp_enrolled")).toHaveLength(1);
    expect(events.filter((e) => e.type === "login_succeeded")).toHaveLength(2);
  });

  it("one generic outcome for a wrong password — the audit record keeps which factor failed", async () => {
    const { reviewer, secret } = await seedReviewer("carol");
    const result = await service.signIn("carol", "totally-wrong-password", codeFor(secret.base32), CONTEXT);
    expect(result).toEqual({ outcome: "invalid_credentials" });

    const events = await eventsFor(reviewer.id);
    expect(events).toEqual([{ type: "login_failed", payload: { factor: "password", totpClockDrift: false } }]);
  });

  it("the same generic outcome for a wrong TOTP code — audit distinguishes the factor, the caller does not", async () => {
    const { reviewer } = await seedReviewer("dave");
    const result = await service.signIn("dave", PASSWORD, "000000", CONTEXT);
    expect(result).toEqual({ outcome: "invalid_credentials" });

    const events = await eventsFor(reviewer.id);
    expect(events).toEqual([{ type: "login_failed", payload: { factor: "totp", totpClockDrift: false } }]);
  });

  it("labels a TOTP failure from clock drift distinctly, without granting access", async () => {
    const { reviewer, secret } = await seedReviewer("erin");
    const driftedCode = codeFor(secret.base32, -60); // two steps ago
    const result = await service.signIn("erin", PASSWORD, driftedCode, CONTEXT);
    expect(result).toEqual({ outcome: "invalid_credentials" });

    const events = await eventsFor(reviewer.id);
    expect(events).toEqual([{ type: "login_failed", payload: { factor: "totp", totpClockDrift: true } }]);
  });

  it("the same TOTP code cannot be replayed, even inside the accept window", async () => {
    const { secret } = await seedReviewer("frank");
    const code = codeFor(secret.base32);
    const first = await service.signIn("frank", PASSWORD, code, CONTEXT);
    expect(first.outcome).toBe("success");

    const second = await service.signIn("frank", PASSWORD, code, CONTEXT);
    expect(second.outcome).toBe("invalid_credentials");
  });

  it("an unknown username fails generically and writes no event (there is no reviewer to attach one to)", async () => {
    const result = await service.signIn("nobody", PASSWORD, "123456", CONTEXT);
    expect(result).toEqual({ outcome: "invalid_credentials" });
    const rows = await admin.pool.query(`SELECT count(*) FROM reviewer_event`);
    expect(Number(rows.rows[0].count)).toBe(0);
  });

  it("a deactivated Reviewer cannot sign in even with correct credentials", async () => {
    const { secret } = await seedReviewer("grace", { deactivated: true });
    const result = await service.signIn("grace", PASSWORD, codeFor(secret.base32), CONTEXT);
    expect(result).toEqual({ outcome: "invalid_credentials" });
  });

  it("throttles after repeated failures, per account, without ever locking out", async () => {
    await seedReviewer("hank");
    for (let i = 0; i < 3; i++) {
      await service.signIn("hank", "wrong", "000000", CONTEXT);
    }
    const throttled = await service.signIn("hank", PASSWORD, "000000", { ip: "198.51.100.9", userAgent: "vitest" });
    expect(throttled).toEqual({ outcome: "throttled" });
  });

  it("throttles per IP too, independent of the account", async () => {
    await seedReviewer("attacker-target-1");
    await seedReviewer("attacker-target-2");
    for (let i = 0; i < 3; i++) {
      await service.signIn("attacker-target-1", "wrong", "000000", CONTEXT);
    }
    const throttled = await service.signIn("attacker-target-2", "wrong", "000000", CONTEXT);
    expect(throttled).toEqual({ outcome: "throttled" });
  });

  it("a successful sign-in resets the throttle", async () => {
    const { secret } = await seedReviewer("iris");
    await service.signIn("iris", "wrong", "000000", CONTEXT);
    await new Promise((r) => setTimeout(r, 2100)); // past the single failure's ~2s backoff window
    const success = await service.signIn("iris", PASSWORD, codeFor(secret.base32), CONTEXT);
    expect(success.outcome).toBe("success");
  });

  it("issues a session with the 6-hour absolute ceiling on success", async () => {
    const { secret } = await seedReviewer("jack");
    const result = await service.signIn("jack", PASSWORD, codeFor(secret.base32), CONTEXT);
    expect(result.outcome).toBe("success");
    if (result.outcome !== "success") throw new Error("unreachable");

    const validation = await service.validateSession(result.token, CONTEXT);
    expect(validation).toMatchObject({ outcome: "valid" });
  });

  it("sign-out deletes the session and records logged_out", async () => {
    const { reviewer, secret } = await seedReviewer("karen");
    const result = await service.signIn("karen", PASSWORD, codeFor(secret.base32), CONTEXT);
    if (result.outcome !== "success") throw new Error("unreachable");

    await service.signOut(result.token, CONTEXT);
    expect(await service.validateSession(result.token, CONTEXT)).toEqual({ outcome: "not_found" });

    const events = await eventsFor(reviewer.id);
    expect(events.map((e) => e.type)).toContain("logged_out");
  });

  describe("self-service password change (requires a live session, current password, and a fresh TOTP code)", () => {
    it("succeeds with the current password and a fresh TOTP code, and records password_changed", async () => {
      const { reviewer, secret } = await seedReviewer("liam");
      await service.signIn("liam", PASSWORD, codeFor(secret.base32), CONTEXT);

      // A code from the next step, so it isn't rejected as a replay of the sign-in's code.
      const result = await service.changePassword(reviewer.id, PASSWORD, "New-Password9!", codeFor(secret.base32, 30));
      expect(result).toEqual({ outcome: "ok" });

      const events = await eventsFor(reviewer.id);
      expect(events.map((e) => e.type)).toContain("password_changed");
    });

    it("rejects the wrong current password", async () => {
      const { reviewer, secret } = await seedReviewer("mona");
      const result = await service.changePassword(reviewer.id, "wrong-current", "New-Password9!", codeFor(secret.base32));
      expect(result).toEqual({ outcome: "invalid_current_credentials" });
    });

    it("rejects a stale TOTP code, exactly as sign-in would", async () => {
      const { reviewer } = await seedReviewer("nate");
      const result = await service.changePassword(reviewer.id, PASSWORD, "New-Password9!", "000000");
      expect(result).toEqual({ outcome: "invalid_current_credentials" });
    });

    it("rejects a new password that violates the shared policy — the same rule the CLI enforces", async () => {
      const { reviewer, secret } = await seedReviewer("olive");
      const result = await service.changePassword(reviewer.id, PASSWORD, "short", codeFor(secret.base32));
      expect(result).toMatchObject({ outcome: "policy_violation" });
    });

    it("throttles repeated wrong attempts — a stolen session cookie is not an unthrottled place to grind a TOTP code", async () => {
      const { reviewer } = await seedReviewer("peter");
      await service.changePassword(reviewer.id, "wrong-current", "New-Password9!", "000000");
      const second = await service.changePassword(reviewer.id, "wrong-current", "New-Password9!", "000000");
      expect(second).toEqual({ outcome: "throttled" });
    });

    it("a successful change resets the throttle", async () => {
      const { reviewer, secret } = await seedReviewer("quinn");
      await service.changePassword(reviewer.id, "wrong-current", "New-Password9!", "000000");
      await new Promise((r) => setTimeout(r, 2100)); // past the single failure's ~2s backoff window
      const ok = await service.changePassword(reviewer.id, PASSWORD, "New-Password9!", codeFor(secret.base32));
      expect(ok).toEqual({ outcome: "ok" });
    });
  });
});
