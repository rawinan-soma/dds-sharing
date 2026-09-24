import { type MailKind } from '../audit/event-catalogue';
import { type Executor, writeRequestEvent } from '../audit/write-request-event';

/**
 * A send given up on (§11.3): the fifth failure, or a queued send Redis lost.
 * A Delivery abandoned also raises the must-clear Send abandoned Alert for the
 * approving Reviewer (§10.6) — the Requester was promised a file whose link
 * never left this building. Every other kind has its own watcher: a queue
 * notification the operator banner, and a rejection or failure notice a
 * Request that already carries its outcome.
 */
export async function writeSendAbandoned(
  db: Executor,
  requestId: string,
  kind: MailKind,
  occurredAt: Date,
): Promise<void> {
  const system = { actorType: 'system' as const };
  await writeRequestEvent(db, {
    requestId,
    type: 'mail_send_abandoned',
    occurredAt,
    actor: system,
    payload: {},
  });
  if (kind === 'delivery') {
    await writeRequestEvent(db, {
      requestId,
      type: 'delivery_alert_raised',
      occurredAt,
      actor: system,
      payload: {},
    });
  }
}
