import { sql } from 'drizzle-orm';
import { type Executor } from '../audit/write-request-event';
import { request } from '../db/schema';
import { type RequestState } from './request-state';

/**
 * Moves a Request from one state to the next, only if it is still in `from`;
 * true when this call moved it. The row is a projection of the events (§12.2),
 * so the caller writes the event that justifies the move in the same
 * transaction — and writes nothing when another writer got there first.
 */
export async function moveRequestState(
  db: Executor,
  requestId: string,
  from: RequestState,
  to: RequestState,
): Promise<boolean> {
  const moved = await db
    .update(request)
    .set({ state: to })
    .where(sql`${request.id} = ${requestId} AND ${request.state} = ${from}`)
    .returning({ id: request.id });
  return moved.length > 0;
}
