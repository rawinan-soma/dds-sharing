import { eq } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { downloadThrottle } from '../db/schema';
import {
  isBlocked,
  recordFailure,
  type ThrottleState,
} from './throttle-policy';

// State in Postgres, not memory or Redis — same reasoning as `LoginThrottle`
// (`reviewer/login-throttle.ts`): a throttle a restart clears is a throttle an
// attacker can wait out.
export class DownloadThrottle {
  constructor(private readonly db: Db) {}

  async isBlocked(ip: string, now: Date): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(downloadThrottle)
      .where(eq(downloadThrottle.ip, ip));
    return isBlocked(row, now);
  }

  async recordFailure(ip: string, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(downloadThrottle)
        .where(eq(downloadThrottle.ip, ip))
        .for('update');
      const next: ThrottleState = recordFailure(row, now);
      await tx
        .insert(downloadThrottle)
        .values({ ip, ...next })
        .onConflictDoUpdate({
          target: downloadThrottle.ip,
          set: next,
        });
    });
  }
}
