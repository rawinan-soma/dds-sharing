import { type Db } from '../db/database.module';
import { reviewerEvent } from '../db/schema';
import { type ReviewerEvent } from '../audit/event-catalogue';

/** A Drizzle handle or an open transaction: the same insert either way. */
type Writer = Pick<Db, 'insert'>;

// Every Reviewer event goes in through here. The discriminated union decides
// which actor kinds and payload a type may carry, so a wrong pairing does not
// compile; this only maps the actor onto the table's columns (§12.2).
export async function writeReviewerEvent(
  db: Writer,
  event: ReviewerEvent,
): Promise<void> {
  const { actor } = event;
  await db.insert(reviewerEvent).values({
    type: event.type,
    actorType: actor.actorType,
    reviewerId: actor.actorType === 'reviewer' ? actor.reviewerId : null,
    // Only the unauthenticated kind (a failed sign-in) carries them.
    ip: actor.actorType === 'anonymous' ? actor.ip : null,
    userAgent: actor.actorType === 'anonymous' ? actor.userAgent : null,
    occurredAt: event.occurredAt,
    payload: event.payload,
  });
}
