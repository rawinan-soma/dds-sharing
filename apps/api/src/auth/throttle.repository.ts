import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { backoffSeconds } from "./throttle-backoff.js";

export const accountThrottleKey = (username: string): string => `account:${username}`;
export const ipThrottleKey = (ip: string): string => `ip:${ip}`;
// Self-service password change checks the same password+TOTP pair sign-in
// does, from behind a live session — a stolen session or a leaked CSRF token
// (deliberately not httpOnly, spec §17.5) should not turn it into an
// unthrottled place to grind a six-digit code.
export const passwordChangeThrottleKey = (reviewerId: string): string => `password-change:${reviewerId}`;

/** Whether `key`'s next-allowed time has not yet arrived. Reads without writing — checking never itself counts as an attempt. */
export async function isThrottled(db: NodePgDatabase<typeof schema>, key: string): Promise<boolean> {
  const row = await db.query.reviewerLoginThrottle.findFirst({
    where: eq(schema.reviewerLoginThrottle.key, key),
  });
  return row !== undefined && row.nextAllowedAt.getTime() > Date.now();
}

/**
 * Records a failed attempt against `key`, advancing its backoff (spec §17.5:
 * exponential per account and per IP, capped near 30s, no lockout). This is
 * an abuse-mitigation counter, not a security boundary — §13.1 is explicit
 * that rate limiting is not a data-protection control — so a read-then-write
 * race between two attempts in the same instant is an accepted, harmless
 * under-count, not a gap worth a database-level atomic upsert here.
 */
export async function recordThrottleFailure(db: NodePgDatabase<typeof schema>, key: string): Promise<void> {
  const now = new Date();
  const existing = await db.query.reviewerLoginThrottle.findFirst({
    where: eq(schema.reviewerLoginThrottle.key, key),
  });
  const failureCount = (existing?.failureCount ?? 0) + 1;
  const nextAllowedAt = new Date(now.getTime() + backoffSeconds(failureCount) * 1000);

  if (existing) {
    await db
      .update(schema.reviewerLoginThrottle)
      .set({ failureCount, nextAllowedAt, updatedAt: now })
      .where(eq(schema.reviewerLoginThrottle.key, key));
  } else {
    await db.insert(schema.reviewerLoginThrottle).values({ key, failureCount, nextAllowedAt, updatedAt: now });
  }
}

/** Clears `key`'s backoff on a successful attempt. Updates rather than deletes — `app_role` holds no DELETE grant on this table. */
export async function resetThrottle(db: NodePgDatabase<typeof schema>, key: string): Promise<void> {
  await db
    .update(schema.reviewerLoginThrottle)
    .set({ failureCount: 0, nextAllowedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.reviewerLoginThrottle.key, key));
}
