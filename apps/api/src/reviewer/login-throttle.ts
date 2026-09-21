import { eq, inArray, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { loginThrottle } from '../db/schema';
import { type Clock } from './clock';

/** Exponential backoff, capping near 30 seconds. There is no lockout at all. */
const BACKOFF_CAP_SECONDS = 30;
/** Failures older than this no longer count "in a row". */
const DECAY_MS = 60 * 60 * 1000;

/**
 * How long the next attempt must wait after `failures` failures in a row. The
 * first failure may retry at once; an attacker holding the right password still
 * cannot brute-force six digits at one attempt per 30 seconds.
 */
export function backoffSeconds(failures: number): number {
  if (failures <= 1) return 0;
  return Math.min(BACKOFF_CAP_SECONDS, 2 ** Math.min(failures - 2, 10));
}

export const accountKey = (username: string) => `account:${username}`;
export const ipKey = (ip: string) => `ip:${ip}`;

// State in Postgres, not memory or Redis: a throttle a `docker compose restart`
// clears is a throttle an attacker can wait out. A row only ever says when the
// next attempt is allowed. Nothing here can lock an account.
export class LoginThrottle {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** Seconds the caller must wait before the next attempt; 0 when free to go. */
  async retryAfterSeconds(keys: string[]): Promise<number> {
    const rows = await this.db
      .select()
      .from(loginThrottle)
      .where(inArray(loginThrottle.key, keys));
    const now = this.clock.now().getTime();
    let wait = 0;
    for (const row of rows) {
      wait = Math.max(
        wait,
        Math.ceil((row.nextAllowedAt.getTime() - now) / 1000),
      );
    }
    return Math.max(0, wait);
  }

  async recordFailure(keys: string[]): Promise<void> {
    const now = this.clock.now();
    for (const key of keys) {
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(loginThrottle)
          .where(eq(loginThrottle.key, key))
          .for('update');
        const stale = row && now.getTime() - row.updatedAt.getTime() > DECAY_MS;
        const failures = row && !stale ? row.failures + 1 : 1;
        const nextAllowedAt = new Date(
          now.getTime() + backoffSeconds(failures) * 1000,
        );
        await tx
          .insert(loginThrottle)
          .values({ key, failures, nextAllowedAt, updatedAt: now })
          .onConflictDoUpdate({
            target: loginThrottle.key,
            set: {
              // Only a concurrent first insert reaches here; the row was read
              // under lock above, so a stale one is reset, not incremented.
              failures: row ? failures : sql`${loginThrottle.failures} + 1`,
              nextAllowedAt,
              updatedAt: now,
            },
          });
      });
    }
  }

  async reset(keys: string[]): Promise<void> {
    await this.db.delete(loginThrottle).where(inArray(loginThrottle.key, keys));
  }
}
