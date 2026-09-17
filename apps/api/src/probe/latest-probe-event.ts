import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/app-db.module.js";
import { requestEvent } from "../db/schema.js";
import type { ProbePerformedPayload, ProbeFailedPayload } from "../db/events.js";

export type LatestProbeEvent =
  | { type: "probe_performed"; payload: ProbePerformedPayload }
  | { type: "probe_failed"; payload: ProbeFailedPayload }
  | undefined;

/**
 * The Probe's own outcome for a Request (spec §5.4), read from the audit
 * spine — never from a column on `request` itself, since `app_role` holds
 * no UPDATE grant there (§12.3) and an insert-only event stream is the only
 * thing that can carry this forward. `undefined` when the Probe never
 * completed (or never ran). Shared by `ReviewerQueueService` (the queue's
 * row count) and `ExtractionProcessor` (the Probe-vs-run drift on
 * `job_completed`) — same query, different projections of the payload.
 */
export async function latestProbeEvent(
  db: AppDb["db"],
  requestId: string,
): Promise<LatestProbeEvent> {
  const [event] = await db
    .select({ type: requestEvent.type, payload: requestEvent.payload })
    .from(requestEvent)
    .where(
      and(
        eq(requestEvent.requestId, requestId),
        inArray(requestEvent.type, ["probe_performed", "probe_failed"]),
      ),
    )
    .orderBy(desc(requestEvent.id))
    .limit(1);

  return event as LatestProbeEvent;
}
