import { and, count, eq, isNull, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type Reviewer = typeof schema.reviewer.$inferSelect;

export function findReviewerByUsername(
  db: NodePgDatabase<typeof schema>,
  username: string,
): Promise<Reviewer | undefined> {
  return db.query.reviewer.findFirst({ where: eq(schema.reviewer.username, username) });
}

export function findReviewerById(db: NodePgDatabase<typeof schema>, id: string): Promise<Reviewer | undefined> {
  return db.query.reviewer.findFirst({ where: eq(schema.reviewer.id, id) });
}

export async function countActiveReviewers(db: NodePgDatabase<typeof schema>): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(schema.reviewer)
    .where(isNull(schema.reviewer.deactivatedAt));
  return row!.count;
}

/** Every other active Reviewer — used to enforce the two-active-reviewer floor before deactivating one. */
export async function countOtherActiveReviewers(db: NodePgDatabase<typeof schema>, excludingId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(schema.reviewer)
    .where(and(isNull(schema.reviewer.deactivatedAt), ne(schema.reviewer.id, excludingId)));
  return row!.count;
}

export interface NewReviewer {
  username: string;
  displayName: string;
  email?: string | null;
  passwordHash: string;
  totpSecret: string;
}

/** CLI-only (spec §17.5): `app_role` holds no INSERT grant on `reviewer`. Call this with the admin connection the seeding CLI runs as. */
export function insertReviewer(db: NodePgDatabase<typeof schema>, reviewer: NewReviewer): Promise<Reviewer> {
  return db
    .insert(schema.reviewer)
    .values({ ...reviewer, mustChangePassword: true })
    .returning()
    .then((rows) => rows[0]!);
}

export async function confirmTotpEnrolment(db: NodePgDatabase<typeof schema>, id: string): Promise<void> {
  await db.update(schema.reviewer).set({ totpConfirmedAt: new Date() }).where(eq(schema.reviewer.id, id));
}

export async function recordTotpStepUsed(db: NodePgDatabase<typeof schema>, id: string, step: number): Promise<void> {
  await db.update(schema.reviewer).set({ totpLastUsedStep: step }).where(eq(schema.reviewer.id, id));
}

export async function updatePasswordHash(
  db: NodePgDatabase<typeof schema>,
  id: string,
  passwordHash: string,
): Promise<void> {
  await db
    .update(schema.reviewer)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(schema.reviewer.id, id));
}

/** CLI-only (spec §17.5): `app_role`'s UPDATE grant on `reviewer` excludes `deactivated_at`. Call this with the admin connection the deactivation CLI runs as. */
export async function deactivateReviewer(db: NodePgDatabase<typeof schema>, id: string): Promise<void> {
  await db.update(schema.reviewer).set({ deactivatedAt: new Date() }).where(eq(schema.reviewer.id, id));
}

/**
 * Deactivation is the only thing that blocks sign-in itself. A seeded-but-
 * unconfirmed account (spec §17.5) can still sign in — its *first* successful
 * sign-in is exactly what confirms TOTP enrolment (see AuthService); what it
 * cannot do until then is act as a Reviewer anywhere else in the system.
 */
export function isActive(reviewer: Reviewer): boolean {
  return reviewer.deactivatedAt === null;
}
