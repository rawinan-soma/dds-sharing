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

    const password = generatePassword();
    // One rule set, one place; a generator drifting from it must not ship.
    if (validatePassword(password).length > 0) {
      throw new Error('generated password violates the password policy');
    }
    const totpSecret = generateTotpSecret();
    const passwordHash = await hashPassword(password);

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
}
