import { inArray } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { mailDelivery } from '../db/schema';

export type MailHealth =
  { status: 'ok' } | { status: 'degraded'; reason: string };

const UNRESOLVED = ['failed', 'abandoned'] as const;

/**
 * The `mail` health component and "operator banner" signal (spec §11.3):
 * degraded when a `queue_notification` has failed even once — there is no
 * Reviewer alert for that kind, because the whole point is that no Reviewer is
 * watching the queue — or when two or more emails of any kind are
 * concurrently unresolved, which the ticket calls an outage rather than N
 * per-Request problems.
 */
export async function mailHealth(db: Db): Promise<MailHealth> {
  const rows = await db
    .select({ kind: mailDelivery.kind })
    .from(mailDelivery)
    .where(inArray(mailDelivery.status, UNRESOLVED));

  const queueNotificationFailed = rows.some(
    (r) => r.kind === 'queue_notification',
  );
  if (queueNotificationFailed) {
    return {
      status: 'degraded',
      reason: 'a queue notification failed to send',
    };
  }
  if (rows.length >= 2) {
    return {
      status: 'degraded',
      reason: `${rows.length} emails are currently failing to send`,
    };
  }
  return { status: 'ok' };
}
