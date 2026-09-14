import { Inject, Injectable } from "@nestjs/common";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import { hashPassword, verifyPassword } from "./password-hash.js";
import { verifyTotpCode } from "./totp.js";
import { checkPasswordPolicy, type PasswordPolicyViolation } from "./password-policy.js";
import {
  findReviewerByUsername,
  findReviewerById,
  confirmTotpEnrolment,
  recordTotpStepUsed,
  updatePasswordHash,
  isActive,
} from "./reviewer.repository.js";
import {
  accountThrottleKey,
  ipThrottleKey,
  isThrottled,
  passwordChangeThrottleKey,
  recordThrottleFailure,
  resetThrottle,
} from "./throttle.repository.js";
import { createSession, deleteSession, validateAndTouchSession, type CreatedSession } from "./session.repository.js";
import { recordReviewerEvent } from "./reviewer-event-writer.js";

export interface RequestContext {
  ip: string;
  userAgent: string;
}

export type SignInResult =
  | { outcome: "throttled" }
  | { outcome: "invalid_credentials" }
  | ({ outcome: "success"; reviewerId: string; displayName: string; mustChangePassword: boolean } & CreatedSession);

/**
 * Everything spec §17.5 says about a sign-in attempt: one form, one generic
 * failure, throttled per account and per IP with no lockout, the audit trail
 * keeping which factor failed while the caller only ever learns
 * "invalid_credentials" or "throttled".
 */
@Injectable()
export class AuthService {
  constructor(@Inject(APP_DB) private readonly appDb: AppDb) {}

  async signIn(username: string, password: string, totpCode: string, context: RequestContext): Promise<SignInResult> {
    const { db } = this.appDb;
    const accountKey = accountThrottleKey(username);
    const ipKey = ipThrottleKey(context.ip);

    if ((await isThrottled(db, accountKey)) || (await isThrottled(db, ipKey))) {
      return { outcome: "throttled" };
    }

    const reviewer = await findReviewerByUsername(db, username);
    if (!reviewer) {
      await recordThrottleFailure(db, accountKey);
      await recordThrottleFailure(db, ipKey);
      return { outcome: "invalid_credentials" };
    }

    const passwordOk = await verifyPassword(reviewer.passwordHash, password);
    const totpResult = verifyTotpCode(reviewer.totpSecret, totpCode, reviewer.totpLastUsedStep);
    const succeeded = isActive(reviewer) && passwordOk && totpResult.outcome === "valid";

    if (!succeeded) {
      await recordThrottleFailure(db, accountKey);
      await recordThrottleFailure(db, ipKey);
      const factor: "password" | "totp" | "deactivated" = !isActive(reviewer)
        ? "deactivated"
        : !passwordOk
          ? "password"
          : "totp";
      await recordReviewerEvent(
        db,
        reviewer.id,
        { type: "login_failed", payload: { factor, totpClockDrift: totpResult.outcome === "drifted" } },
        context,
      );
      return { outcome: "invalid_credentials" };
    }

    await resetThrottle(db, accountKey);
    await resetThrottle(db, ipKey);

    if (totpResult.outcome === "valid") {
      await recordTotpStepUsed(db, reviewer.id, totpResult.step);
    }
    // A seeded-but-unconfirmed account's first successful sign-in is what confirms TOTP enrolment (spec §17.5).
    if (reviewer.totpConfirmedAt === null) {
      await confirmTotpEnrolment(db, reviewer.id);
      await recordReviewerEvent(db, reviewer.id, { type: "totp_enrolled", payload: {} }, context);
    }

    await recordReviewerEvent(db, reviewer.id, { type: "login_succeeded", payload: {} }, context);
    const session = await createSession(db, reviewer.id, context);

    return {
      outcome: "success",
      reviewerId: reviewer.id,
      displayName: reviewer.displayName,
      mustChangePassword: reviewer.mustChangePassword,
      ...session,
    };
  }

  async currentReviewer(reviewerId: string): Promise<{ displayName: string; mustChangePassword: boolean } | undefined> {
    const { db } = this.appDb;
    const reviewer = await findReviewerById(db, reviewerId);
    return reviewer && { displayName: reviewer.displayName, mustChangePassword: reviewer.mustChangePassword };
  }

  async signOut(token: string, context: RequestContext): Promise<void> {
    const { db } = this.appDb;
    const validation = await validateAndTouchSession(db, token);
    await deleteSession(db, token);
    if (validation.outcome === "valid") {
      await recordReviewerEvent(db, validation.reviewerId, { type: "logged_out", payload: {} }, context);
    }
  }

  async validateSession(token: string, context: RequestContext) {
    const { db } = this.appDb;
    const result = await validateAndTouchSession(db, token);
    if (result.outcome === "expired") {
      await recordReviewerEvent(
        db,
        result.reviewerId,
        { type: "session_expired", payload: { reason: result.reason } },
        context,
      );
    }
    return result;
  }

  /**
   * Self-service password change (spec §17.5): requires a live session, the
   * current password, and a fresh TOTP code — not a bypass. Throttled the
   * same way sign-in is: this checks the identical password+TOTP pair, so it
   * gets the identical per-account backoff rather than an unthrottled retry
   * loop against whichever session cookie the caller holds.
   */
  async changePassword(
    reviewerId: string,
    currentPassword: string,
    newPassword: string,
    totpCode: string,
  ): Promise<
    | { outcome: "ok" }
    | { outcome: "throttled" }
    | { outcome: "invalid_current_credentials" }
    | { outcome: "policy_violation"; violations: PasswordPolicyViolation[] }
  > {
    const { db } = this.appDb;
    const throttleKey = passwordChangeThrottleKey(reviewerId);
    if (await isThrottled(db, throttleKey)) {
      return { outcome: "throttled" };
    }

    const reviewer = await findReviewerById(db, reviewerId);
    if (!reviewer) return { outcome: "invalid_current_credentials" };

    const passwordOk = await verifyPassword(reviewer.passwordHash, currentPassword);
    const totpResult = verifyTotpCode(reviewer.totpSecret, totpCode, reviewer.totpLastUsedStep);
    if (!passwordOk || totpResult.outcome !== "valid") {
      await recordThrottleFailure(db, throttleKey);
      return { outcome: "invalid_current_credentials" };
    }
    await resetThrottle(db, throttleKey);
    // Marked spent as soon as it's confirmed valid — a policy violation below
    // must not leave a still-valid TOTP code eligible for reuse.
    await recordTotpStepUsed(db, reviewer.id, totpResult.step);

    const violations = checkPasswordPolicy(newPassword);
    if (violations.length > 0) {
      return { outcome: "policy_violation", violations };
    }

    const passwordHash = await hashPassword(newPassword);
    await updatePasswordHash(db, reviewer.id, passwordHash);
    await recordReviewerEvent(db, reviewer.id, { type: "password_changed", payload: {} });
    return { outcome: "ok" };
  }
}
