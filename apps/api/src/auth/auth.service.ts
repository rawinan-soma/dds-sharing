import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { APP_DB } from "./app-db.provider.js";
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
  constructor(@Inject(APP_DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async signIn(username: string, password: string, totpCode: string, context: RequestContext): Promise<SignInResult> {
    const accountKey = accountThrottleKey(username);
    const ipKey = ipThrottleKey(context.ip);

    if ((await isThrottled(this.db, accountKey)) || (await isThrottled(this.db, ipKey))) {
      return { outcome: "throttled" };
    }

    const reviewer = await findReviewerByUsername(this.db, username);
    if (!reviewer) {
      await recordThrottleFailure(this.db, accountKey);
      await recordThrottleFailure(this.db, ipKey);
      return { outcome: "invalid_credentials" };
    }

    const passwordOk = await verifyPassword(reviewer.passwordHash, password);
    const totpResult = verifyTotpCode(reviewer.totpSecret, totpCode, reviewer.totpLastUsedStep);
    const succeeded = isActive(reviewer) && passwordOk && totpResult.outcome === "valid";

    if (!succeeded) {
      await recordThrottleFailure(this.db, accountKey);
      await recordThrottleFailure(this.db, ipKey);
      const factor: "password" | "totp" = !isActive(reviewer) || !passwordOk ? "password" : "totp";
      await recordReviewerEvent(
        this.db,
        reviewer.id,
        { type: "login_failed", payload: { factor, totpClockDrift: totpResult.outcome === "drifted" } },
        context,
      );
      return { outcome: "invalid_credentials" };
    }

    await resetThrottle(this.db, accountKey);
    await resetThrottle(this.db, ipKey);

    if (totpResult.outcome === "valid") {
      await recordTotpStepUsed(this.db, reviewer.id, totpResult.step);
    }
    // A seeded-but-unconfirmed account's first successful sign-in is what confirms TOTP enrolment (spec §17.5).
    if (reviewer.totpConfirmedAt === null) {
      await confirmTotpEnrolment(this.db, reviewer.id);
      await recordReviewerEvent(this.db, reviewer.id, { type: "totp_enrolled", payload: {} }, context);
    }

    await recordReviewerEvent(this.db, reviewer.id, { type: "login_succeeded", payload: {} }, context);
    const session = await createSession(this.db, reviewer.id, context);

    return {
      outcome: "success",
      reviewerId: reviewer.id,
      displayName: reviewer.displayName,
      mustChangePassword: reviewer.mustChangePassword,
      ...session,
    };
  }

  async currentReviewer(reviewerId: string): Promise<{ displayName: string; mustChangePassword: boolean } | undefined> {
    const reviewer = await findReviewerById(this.db, reviewerId);
    return reviewer && { displayName: reviewer.displayName, mustChangePassword: reviewer.mustChangePassword };
  }

  async signOut(token: string, context: RequestContext): Promise<void> {
    const validation = await validateAndTouchSession(this.db, token);
    await deleteSession(this.db, token);
    if (validation.outcome === "valid") {
      await recordReviewerEvent(this.db, validation.reviewerId, { type: "logged_out", payload: {} }, context);
    }
  }

  async validateSession(token: string, context: RequestContext) {
    const result = await validateAndTouchSession(this.db, token);
    if (result.outcome === "expired") {
      await recordReviewerEvent(
        this.db,
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
    const throttleKey = passwordChangeThrottleKey(reviewerId);
    if (await isThrottled(this.db, throttleKey)) {
      return { outcome: "throttled" };
    }

    const reviewer = await findReviewerById(this.db, reviewerId);
    if (!reviewer) return { outcome: "invalid_current_credentials" };

    const passwordOk = await verifyPassword(reviewer.passwordHash, currentPassword);
    const totpResult = verifyTotpCode(reviewer.totpSecret, totpCode, reviewer.totpLastUsedStep);
    if (!passwordOk || totpResult.outcome !== "valid") {
      await recordThrottleFailure(this.db, throttleKey);
      return { outcome: "invalid_current_credentials" };
    }
    await resetThrottle(this.db, throttleKey);

    const violations = checkPasswordPolicy(newPassword);
    if (violations.length > 0) {
      return { outcome: "policy_violation", violations };
    }

    await recordTotpStepUsed(this.db, reviewer.id, totpResult.step);
    const passwordHash = await hashPassword(newPassword);
    await updatePasswordHash(this.db, reviewer.id, passwordHash);
    await recordReviewerEvent(this.db, reviewer.id, { type: "password_changed", payload: {} });
    return { outcome: "ok" };
  }
}
