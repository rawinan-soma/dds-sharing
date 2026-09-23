import { and, eq, min, sql } from 'drizzle-orm';
import { requestEvent } from '../db/schema';
import { type Executor } from './write-request-event';

/**
 * When the Reviewers were told about a Request: the first queue notification
 * the relay accepted, or null if none ever was. The `expired` event carries it
 * (§12.4) so an expiry "through nobody's fault" — a silent queue notification
 * (§11.3) — reads differently in the record from one nobody acted on.
 */
export async function queueNotifiedAt(
  db: Executor,
  requestId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ at: min(requestEvent.occurredAt) })
    .from(requestEvent)
    .where(
      and(
        eq(requestEvent.requestId, requestId),
        eq(requestEvent.type, 'mail_sent'),
        sql`${requestEvent.payload}->>'kind' = 'queue_notification'`,
      ),
    );
  return row?.at ? row.at.toISOString() : null;
}
