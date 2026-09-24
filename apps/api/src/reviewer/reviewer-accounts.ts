import { and, count, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { reviewer, reviewerSession } from '../db/schema';
import { type Clock } from '../clock/clock';
import {
  generatePassword,
  hashPassword,
  validatePassword,
} from './password-policy';
import { enrolmentUri, generateTotpSecret } from './totp';
import { writeReviewerEvent } from './reviewer-events';
import { ADVISORY_LOCK } from '../db/advisory-locks';

/** The floor: two reachable people, one being the other's only recovery path. */
export const MIN_ACTIVE_REVIEWERS = 2;

const USERNAME = /^[a-z0-9._-]{3,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SeedInput {
  username: string;
  /** The person's real name. It stays on every Decision, permanently. */
  displayName: string;
  email: string;
}

export interface SeededReviewer {
  reviewerId: string;
  /** Shown once, to the Reviewer, at the ceremony. Never stored in the clear. */
  password: string;
  totpSecret: string;
  enrolmentUri: string;
}

export type DeactivateOutcome =
  | { status: 'deactivated'; forcedBelowFloor: boolean; sessionsEnded: number }
  | { status: 'refused_floor'; activeAfter: number }
  | { status: 'not_found' }
  | { status: 'already_deactivated' };

/** Neither a reset nor a re-enrolment revives a deactivated account. */
export type CredentialRefusal =
  { status: 'not_found' } | { status: 'deactivated' };

export type ResetPasswordOutcome =
  | { status: 'reset'; password: string; sessionsEnded: number }
  | CredentialRefusal;

export type ReenrolTotpOutcome =
  | {
      status: 're_enrolled';
      totpSecret: string;
      enrolmentUri: string;
      sessionsEnded: number;
    }
  | CredentialRefusal;

export class ReviewerInputError extends Error {}

// What the host commands do, without any of their I/O. Host commands name no
// one (ADR 0020): nothing here takes, reads or records an operator, and the
// events say only what happened to the Reviewer.
export class ReviewerAccounts {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async seed(input: SeedInput): Promise<SeededReviewer> {
    const username = input.username.trim();
    const displayName = input.displayName.trim();
    const email = input.email.trim();
    if (!USERNAME.test(username)) {
      throw new ReviewerInputError(
        'The username must be 3-32 characters of lower-case letters, digits, dot, underscore or hyphen.',
      );
    }
    // Deliberately not derived from the username: it is unerasable.
    if (!displayName) {
      throw new ReviewerInputError(
        "The display name is required and must be the person's real name.",
      );
    }
    if (!EMAIL.test(email)) {
      throw new ReviewerInputError('The email address is not valid.');
    }

    const { password, passwordHash } = await newPassword();
    const totpSecret = generateTotpSecret();

    const reviewerId = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(reviewer)
        .values({
          username,
          displayName,
          email,
          passwordHash,
          totpSecret,
        })
        .onConflictDoNothing({ target: reviewer.username })
        .returning({ id: reviewer.id });
      if (inserted.length === 0) {
        throw new ReviewerInputError(`Username "${username}" already exists.`);
      }
      const id = inserted[0].id;
      await writeReviewerEvent(tx, {
        type: 'seeded',
        occurredAt: this.clock.now(),
        actor: { actorType: 'system' },
        payload: {},
      });
      return id;
    });

    return {
      reviewerId,
      password,
      totpSecret,
      enrolmentUri: enrolmentUri(username, totpSecret),
    };
  }

  /**
   * Active means reachable: not deactivated and one code has confirmed the
   * authenticator. A seeded-but-unconfirmed account is inert, so it is not a
   * recovery path for anyone.
   */
  async countActive(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(reviewer)
      .where(
        and(
          isNull(reviewer.deactivatedAt),
          isNotNull(reviewer.totpConfirmedAt),
        ),
      );
    return row.n;
  }

  async deactivate(
    username: string,
    options: { force: boolean },
  ): Promise<DeactivateOutcome> {
    return this.db.transaction(async (tx) => {
      // Serialises concurrent deactivations, so two commands cannot each see
      // "two left" and both proceed.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK.reviewerAccounts})`,
      );

      const [target] = await tx
        .select()
        .from(reviewer)
        .where(eq(reviewer.username, username.trim()));
      if (!target) return { status: 'not_found' };
      if (target.deactivatedAt) return { status: 'already_deactivated' };

      // Deactivating an inert account takes nothing from the reachable count.
      const reachable = target.totpConfirmedAt !== null;
      const [others] = await tx
        .select({ n: count() })
        .from(reviewer)
        .where(
          and(
            ne(reviewer.id, target.id),
            isNull(reviewer.deactivatedAt),
            isNotNull(reviewer.totpConfirmedAt),
          ),
        );
      const activeAfter = others.n;
      const belowFloor = reachable && activeAfter < MIN_ACTIVE_REVIEWERS;
      if (belowFloor && !options.force) {
        return { status: 'refused_floor', activeAfter };
      }

      await tx
        .update(reviewer)
        .set({ deactivatedAt: this.clock.now() })
        .where(eq(reviewer.id, target.id));
      // Immediately: the session table is the only place a session lives.
      const ended = await tx
        .delete(reviewerSession)
        .where(eq(reviewerSession.reviewerId, target.id))
        .returning({ id: reviewerSession.id });
      await writeReviewerEvent(tx, {
        type: 'deactivated',
        occurredAt: this.clock.now(),
        actor: { actorType: 'system' },
        payload: { force: options.force },
      });
      return {
        status: 'deactivated',
        forcedBelowFloor: belowFloor,
        sessionsEnded: ended.length,
      };
    });
  }

  /**
   * "I think someone saw me type it" when they cannot sign in to change it.
   * The next sign-in forces a change. Recorded as `password_reset`, naming the
   * account and never who ran it (ADR 0020).
   */
  async resetPassword(username: string): Promise<ResetPasswordOutcome> {
    const { password, passwordHash } = await newPassword();
    return this.replaceCredential(
      'password_reset',
      username,
      { passwordHash, mustChangePassword: true },
      (sessionsEnded) => ({ status: 'reset', password, sessionsEnded }),
    );
  }

  /**
   * A lost or replaced phone. The account is inert again until one code from
   * the new enrolment confirms it, and that sign-in writes `totp_enrolled`.
   * Recorded as `totp_reset` the moment it runs.
   */
  async reenrolTotp(username: string): Promise<ReenrolTotpOutcome> {
    const totpSecret = generateTotpSecret();
    return this.replaceCredential(
      'totp_reset',
      username,
      { totpSecret, totpConfirmedAt: null, totpLastUsedStep: null },
      (sessionsEnded) => ({
        status: 're_enrolled',
        totpSecret,
        enrolmentUri: enrolmentUri(username.trim(), totpSecret),
        sessionsEnded,
      }),
    );
  }

  // Replacing a credential ends every live session: whoever held the old one
  // may be the reason for the replacement.
  private replaceCredential<T>(
    type: 'password_reset' | 'totp_reset',
    username: string,
    set: Partial<typeof reviewer.$inferInsert>,
    done: (sessionsEnded: number) => T,
  ): Promise<T | CredentialRefusal> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({
          id: reviewer.id,
          username: reviewer.username,
          deactivatedAt: reviewer.deactivatedAt,
        })
        .from(reviewer)
        .where(eq(reviewer.username, username.trim()))
        .for('update');
      if (!target) return { status: 'not_found' as const };
      if (target.deactivatedAt) return { status: 'deactivated' as const };

      await tx.update(reviewer).set(set).where(eq(reviewer.id, target.id));
      const ended = await tx
        .delete(reviewerSession)
        .where(eq(reviewerSession.reviewerId, target.id))
        .returning({ id: reviewerSession.id });
      await writeReviewerEvent(tx, {
        type,
        occurredAt: this.clock.now(),
        actor: { actorType: 'system' },
        payload: { username: target.username, sessionsEnded: ended.length },
      });
      return done(ended.length);
    });
  }
}

async function newPassword(): Promise<{
  password: string;
  passwordHash: string;
}> {
  const password = generatePassword();
  // One rule set, one place; a generator drifting from it must not ship.
  if (validatePassword(password).length > 0) {
    throw new Error('generated password violates the password policy');
  }
  return { password, passwordHash: await hashPassword(password) };
}
