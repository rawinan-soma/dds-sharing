import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { reviewer } from '../db/schema';
import { type Clock } from './clock';
import { accountKey, ipKey, type LoginThrottle } from './login-throttle';
import {
  hashPassword,
  validatePassword,
  verifyPassword,
  type PasswordViolation,
} from './password-policy';
import { writeReviewerEvent } from './reviewer-events';
import { type ReviewerSessions } from './reviewer-sessions';
import { verifyTotp } from './totp';

export interface Origin {
  ip: string;
  userAgent: string;
}

export type SignInResult =
  | {
      status: 'ok';
      token: string;
      displayName: string;
      expiresAt: Date;
      mustChangePassword: boolean;
    }
  | { status: 'failed' }
  | { status: 'throttled'; retryAfterSeconds: number };

export type ChangePasswordResult =
  | { status: 'ok' }
  | { status: 'failed' }
  | { status: 'throttled'; retryAfterSeconds: number }
  | { status: 'policy'; violations: (PasswordViolation | 'same_as_current')[] };

/** The submitted username is attacker-controlled and the record is permanent. */
const RECORDED_USERNAME_MAX = 64;

const normalise = (username: string) =>
  username.trim().toLowerCase().slice(0, RECORDED_USERNAME_MAX);

// Verified against when the username is unknown, so a miss costs the same time
// as a hit and the response time does not say which usernames exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('Dummy-Password-1!'));

// The password and the TOTP code are submitted on one form and checked
// together, always both, whatever the first answer was. A two-step form tells an
// attacker when the password is right, which is the signal that makes attacking
// the second factor worthwhile. The audit record keeps which factor failed; the
// caller's screen never learns it.
// Attempts on one account run one at a time. Without this, N parallel guesses
// all read "not throttled" before any of them records a failure, and the
// one-attempt-per-30-seconds bound on a six-digit code would not hold. One
// process serves the app (the kill switch is `docker compose down`), so a
// keyed in-process queue is enough.
const accountQueues = new Map<string, Promise<unknown>>();
async function serially<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = accountQueues.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  accountQueues.set(key, tail);
  try {
    return await run;
  } finally {
    if (accountQueues.get(key) === tail) accountQueues.delete(key);
  }
}

export class ReviewerAuth {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly throttle: LoginThrottle,
    private readonly sessions: ReviewerSessions,
  ) {}

  signIn(
    input: { username: string; password: string; code: string },
    origin: Origin,
  ): Promise<SignInResult> {
    const username = normalise(input.username);
    return serially(accountKey(username), () =>
      this.attemptSignIn(username, input, origin),
    );
  }

  private async attemptSignIn(
    username: string,
    input: { password: string; code: string },
    origin: Origin,
  ): Promise<SignInResult> {
    const keys = [accountKey(username), ipKey(origin.ip)];

    const wait = await this.throttle.retryAfterSeconds(keys);
    // Refused unread: evaluating a throttled attempt would make the delay an
    // oracle, and recording it would let a stranger fill the permanent record.
    if (wait > 0) return { status: 'throttled', retryAfterSeconds: wait };

    const [account] = await this.db
      .select()
      .from(reviewer)
      .where(eq(reviewer.username, username));

    const passwordOk = await verifyPassword(
      account?.passwordHash ?? (await getDummyHash()),
      input.password,
    );
    const totp = account
      ? verifyTotp(
          account.totpSecret,
          input.code,
          this.clock.now().getTime(),
          account.totpLastUsedStep,
        )
      : null;
    const totpOk = totp?.ok === true;

    if (account && !account.deactivatedAt && passwordOk && totp?.ok) {
      const result = await this.completeSignIn(account, totp.step);
      if (result) {
        await this.throttle.reset(keys);
        return result;
      }
      // A concurrent request spent the same code: a replay, so a failure.
    }

    const failedFactor = !account
      ? 'username'
      : account.deactivatedAt
        ? 'deactivated'
        : passwordOk && !totpOk
          ? 'totp'
          : !passwordOk && totpOk
            ? 'password'
            : 'password_and_totp';
    await writeReviewerEvent(this.db, {
      type: 'login_failed',
      occurredAt: this.clock.now(),
      actor: {
        actorType: 'anonymous',
        ip: origin.ip,
        userAgent: origin.userAgent,
      },
      // Never the submitted password or code: the pattern is the signal. The
      // username is recorded only when it names a real account: a Reviewer who
      // types their password into the wrong box must not put it in a record
      // that is kept for ever.
      payload: {
        username: account?.username ?? '',
        failedFactor,
        totpClockDrift: totp?.drift ?? false,
      },
    });
    await this.throttle.recordFailure(keys);
    return { status: 'failed' };
  }

  private async completeSignIn(
    account: typeof reviewer.$inferSelect,
    step: number,
  ): Promise<SignInResult | null> {
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      // Spends the step atomically: only one request can move the marker
      // forward, so a code cannot be used twice even concurrently.
      const spent = await tx
        .update(reviewer)
        .set({
          totpLastUsedStep: step,
          ...(account.totpConfirmedAt ? {} : { totpConfirmedAt: now }),
        })
        .where(
          and(
            eq(reviewer.id, account.id),
            or(
              isNull(reviewer.totpLastUsedStep),
              lt(reviewer.totpLastUsedStep, step),
            ),
          ),
        )
        .returning({ id: reviewer.id });
      if (spent.length === 0) return null;

      if (!account.totpConfirmedAt) {
        // The first valid code proves the phone holds the secret.
        await writeReviewerEvent(tx, {
          type: 'totp_enrolled',
          occurredAt: now,
          actor: { actorType: 'reviewer', reviewerId: account.id },
          payload: {},
        });
      }
      const session = await this.sessions.create(account.id, tx);
      await writeReviewerEvent(tx, {
        type: 'login_succeeded',
        occurredAt: now,
        actor: { actorType: 'reviewer', reviewerId: account.id },
        payload: {},
      });
      return {
        status: 'ok' as const,
        token: session.token,
        displayName: account.displayName,
        expiresAt: session.expiresAt,
        mustChangePassword: account.mustChangePassword,
      };
    });
  }

  async signOut(token: string, reviewerId: string): Promise<void> {
    if (await this.sessions.destroy(token)) {
      await writeReviewerEvent(this.db, {
        type: 'logged_out',
        occurredAt: this.clock.now(),
        actor: { actorType: 'reviewer', reviewerId },
        payload: {},
      });
    }
  }

  /**
   * Self-service change, needing a live session (the caller's guard), the
   * current password and a *fresh* TOTP code, meaning one from a step later than
   * any already spent, so the code that signed the Reviewer in cannot be reused.
   * Credential failures are throttled and answered exactly as sign-in is.
   */
  async changePassword(
    input: {
      reviewerId: string;
      sessionToken: string;
      currentPassword: string;
      newPassword: string;
      code: string;
    },
    origin: Origin,
  ): Promise<ChangePasswordResult> {
    const [account] = await this.db
      .select()
      .from(reviewer)
      .where(eq(reviewer.id, input.reviewerId));
    if (!account || account.deactivatedAt) return { status: 'failed' };

    const keys = [accountKey(account.username), ipKey(origin.ip)];
    const wait = await this.throttle.retryAfterSeconds(keys);
    if (wait > 0) return { status: 'throttled', retryAfterSeconds: wait };

    const passwordOk = await verifyPassword(
      account.passwordHash,
      input.currentPassword,
    );
    const totp = verifyTotp(
      account.totpSecret,
      input.code,
      this.clock.now().getTime(),
      account.totpLastUsedStep,
    );
    if (!passwordOk || !totp.ok) {
      await this.throttle.recordFailure(keys);
      return { status: 'failed' };
    }

    // The policy is checked after the credentials and before the code is spent,
    // so a rejected new password costs the Reviewer nothing.
    const violations: (PasswordViolation | 'same_as_current')[] =
      validatePassword(input.newPassword);
    if (input.newPassword === input.currentPassword) {
      violations.push('same_as_current');
    }
    if (violations.length > 0) return { status: 'policy', violations };

    const newHash = await hashPassword(input.newPassword);
    const now = this.clock.now();
    const changed = await this.db.transaction(async (tx) => {
      const spent = await tx
        .update(reviewer)
        .set({
          passwordHash: newHash,
          mustChangePassword: false,
          totpLastUsedStep: totp.step,
        })
        .where(
          and(
            eq(reviewer.id, account.id),
            or(
              isNull(reviewer.totpLastUsedStep),
              lt(reviewer.totpLastUsedStep, totp.step),
            ),
          ),
        )
        .returning({ id: reviewer.id });
      if (spent.length === 0) return false;
      await this.sessions.destroyOthers(account.id, input.sessionToken, tx);
      await writeReviewerEvent(tx, {
        type: 'password_changed',
        occurredAt: now,
        actor: { actorType: 'reviewer', reviewerId: account.id },
        payload: {},
      });
      return true;
    });
    if (!changed) {
      await this.throttle.recordFailure(keys);
      return { status: 'failed' };
    }
    await this.throttle.reset(keys);
    return { status: 'ok' };
  }
}
