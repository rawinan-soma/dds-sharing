import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

// Sliding 1-hour idle timeout inside a 6-hour absolute ceiling from login
// (spec §17.5). The ceiling is fixed at creation and never rewritten — "a
// ceiling with an exception is not a ceiling" — only `lastSeenAt` slides.
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const SESSION_ABSOLUTE_CEILING_MS = 6 * 60 * 60 * 1000;

// A hygiene bound, not a control (spec §17.5): concurrent sessions are
// allowed, capped at 3 per Reviewer, oldest evicted.
export const SESSION_MAX_CONCURRENT = 3;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh opaque session token. Only its hash is ever stored, so a database read can never disclose a live cookie value. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface CreatedSession {
  token: string;
  absoluteExpiresAt: Date;
}

export async function createSession(
  db: NodePgDatabase<typeof schema>,
  reviewerId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_CEILING_MS);

  await db.insert(schema.reviewerSession).values({
    tokenHash: hashToken(token),
    reviewerId,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    createdAt: now,
    lastSeenAt: now,
    absoluteExpiresAt,
  });

  await evictOldestBeyondCap(db, reviewerId);

  return { token, absoluteExpiresAt };
}

async function evictOldestBeyondCap(db: NodePgDatabase<typeof schema>, reviewerId: string): Promise<void> {
  const sessions = await db.query.reviewerSession.findMany({
    where: eq(schema.reviewerSession.reviewerId, reviewerId),
    orderBy: asc(schema.reviewerSession.createdAt),
  });
  const overflow = sessions.length - SESSION_MAX_CONCURRENT;
  if (overflow <= 0) return;

  const survivors = sessions.slice(overflow).map((session) => session.tokenHash);
  await db
    .delete(schema.reviewerSession)
    .where(
      and(
        eq(schema.reviewerSession.reviewerId, reviewerId),
        survivors.length > 0 ? notInArray(schema.reviewerSession.tokenHash, survivors) : undefined,
      ),
    );
}

export type SessionValidation =
  | { outcome: "valid"; reviewerId: string; idleExpiresAt: Date; absoluteExpiresAt: Date }
  | { outcome: "not_found" }
  | { outcome: "expired"; reviewerId: string; reason: "idle_timeout" | "absolute_ceiling" };

/** Validates a session token and, if it is still live, slides its idle window — the absolute ceiling itself is never touched. */
export async function validateAndTouchSession(
  db: NodePgDatabase<typeof schema>,
  token: string,
): Promise<SessionValidation> {
  const tokenHash = hashToken(token);
  const session = await db.query.reviewerSession.findFirst({
    where: eq(schema.reviewerSession.tokenHash, tokenHash),
  });
  if (!session) return { outcome: "not_found" };

  const now = new Date();
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) {
    await db.delete(schema.reviewerSession).where(eq(schema.reviewerSession.tokenHash, tokenHash));
    return { outcome: "expired", reviewerId: session.reviewerId, reason: "absolute_ceiling" };
  }
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    await db.delete(schema.reviewerSession).where(eq(schema.reviewerSession.tokenHash, tokenHash));
    return { outcome: "expired", reviewerId: session.reviewerId, reason: "idle_timeout" };
  }

  await db.update(schema.reviewerSession).set({ lastSeenAt: now }).where(eq(schema.reviewerSession.tokenHash, tokenHash));
  return {
    outcome: "valid",
    reviewerId: session.reviewerId,
    idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_TIMEOUT_MS),
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

export async function deleteSession(db: NodePgDatabase<typeof schema>, token: string): Promise<void> {
  await db.delete(schema.reviewerSession).where(eq(schema.reviewerSession.tokenHash, hashToken(token)));
}

/** Invalidates every live session for a Reviewer immediately — how deactivation takes effect (spec §17.5). */
export async function deleteAllSessionsForReviewer(db: NodePgDatabase<typeof schema>, reviewerId: string): Promise<void> {
  await db.delete(schema.reviewerSession).where(eq(schema.reviewerSession.reviewerId, reviewerId));
}
