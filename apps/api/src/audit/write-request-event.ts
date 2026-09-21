import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { requestEvent } from '../db/schema';
import { type RequestEvent } from './event-catalogue';

// Anything that can run an INSERT: the database, or a transaction of it. Writing
// through a transaction is how an event lands atomically with the state change
// it records (§12.2: `approved` and `job_queued` share one).
type Executor =
  NodePgDatabase<Record<string, never>> | PgTransaction<any, any, any>;

// The only writer of `request_event`. The type of `event` is the catalogue's
// discriminated union, so an actor or a payload the catalogue does not allow for
// that event type does not compile.
export async function writeRequestEvent(
  db: Executor,
  event: RequestEvent,
): Promise<void> {
  const { actor } = event;
  // Only the unauthenticated kinds carry a network origin (§12.2).
  const origin =
    actor.actorType === 'requester' || actor.actorType === 'anonymous'
      ? actor
      : null;
  await db.insert(requestEvent).values({
    requestId: event.requestId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorType: actor.actorType,
    reviewerId: actor.actorType === 'reviewer' ? actor.reviewerId : null,
    ip: origin?.ip ?? null,
    userAgent: origin?.userAgent ?? null,
    payload: event.payload,
  });
}
