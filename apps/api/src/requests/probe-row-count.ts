import { and, eq, inArray } from 'drizzle-orm';
import { type RequestEventPayloads } from '../audit/event-catalogue';
import { type Executor } from '../audit/write-request-event';
import { requestEvent } from '../db/schema';

/** The summed count, or the Probe's still-pending or abandoned state (§5.4). */
export type ProbeRowCount = number | 'pending' | 'failed';

/**
 * The row count as a Reviewer sees it now. `probe_performed`/`probe_failed`
 * is terminal and written at most once per Request (§5.4), so the first match
 * settles it; no event yet reads pending. One read, so the dossier and the
 * Snapshot of the Decision taken on it can never disagree.
 */
export async function probeRowCountOf(
  db: Executor,
  requestId: string,
): Promise<ProbeRowCount> {
  const [row] = await db
    .select({ type: requestEvent.type, payload: requestEvent.payload })
    .from(requestEvent)
    .where(
      and(
        eq(requestEvent.requestId, requestId),
        inArray(requestEvent.type, ['probe_performed', 'probe_failed']),
      ),
    )
    .limit(1);
  if (!row) return 'pending';
  if (row.type === 'probe_failed') return 'failed';
  return (row.payload as RequestEventPayloads['probe_performed']).totalItems;
}
