import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { ReviewerEventPayload } from "../db/events.js";

export interface ReviewerEventContext {
  ip?: string | null;
  userAgent?: string | null;
  occurredAt?: Date;
}

/**
 * The one place a `reviewer_event` row is ever inserted (spec §12.4). Typed
 * against {@link ReviewerEventPayload} so a payload can never drift from its
 * event type, and never accepts a password or TOTP code — there is no field
 * for one.
 */
export async function recordReviewerEvent(
  db: NodePgDatabase<typeof schema>,
  reviewerId: string,
  event: ReviewerEventPayload,
  context: ReviewerEventContext = {},
): Promise<void> {
  await db.insert(schema.reviewerEvent).values({
    reviewerId,
    type: event.type,
    payload: event.payload,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    occurredAt: context.occurredAt ?? new Date(),
  });
}
