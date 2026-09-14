import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import {
  province,
  request,
  requestContact,
  requestEvent,
} from "../db/schema.js";
import type { ProbePerformedPayload } from "../db/events.js";
import type { AreaKind } from "../requests/request-state.js";
import { validateSpan } from "../requests/span.js";
import { addBusinessHours, decisionWindowView } from "./business-hours.js";
import type {
  AreaView,
  QueueRow,
  RequestDetail,
} from "./reviewer-queue.types.js";

// Request expiry at 24 business hours (spec §10.4): a predicate computed at
// read time, never a scheduled state change, so a Request past this
// threshold is simply not actionable — and a dead scheduler can never
// un-expire one, because nothing ever wrote "expired" to make it actionable
// again in the first place.
const DECISION_WINDOW_HOURS = 24;

@Injectable()
export class ReviewerQueueService {
  constructor(@Inject(APP_DB) private readonly appDb: AppDb) {}

  /**
   * The pending zone only (spec §10.1) — decided Requests live elsewhere and
   * are not this ticket's to build. Oldest first: the clock is what matters
   * here (design handoff, screen 7b).
   */
  async listPending(now: Date): Promise<QueueRow[]> {
    const { db } = this.appDb;
    const rows = await db
      .select({
        id: request.id,
        referenceNumber: request.referenceNumber,
        diseaseGroupNameTh: request.diseaseGroupNameTh,
        submittedAt: request.submittedAt,
        name: requestContact.name,
        surname: requestContact.surname,
        workplace: requestContact.workplace,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .where(eq(request.state, "pending"))
      .orderBy(asc(request.submittedAt));

    return rows.map((row) => ({
      id: row.id,
      referenceNumber: row.referenceNumber,
      requesterName: `${row.name} ${row.surname}`,
      workplace: row.workplace,
      diseaseGroupNameTh: row.diseaseGroupNameTh,
      submittedAt: row.submittedAt.toISOString(),
      ...decisionWindowView(row.submittedAt, now, DECISION_WINDOW_HOURS),
    }));
  }

  /**
   * `null` when `id` is not a pending Request — including one that never
   * existed, one already decided, and one that does exist but has drifted
   * out of the pending zone. The Reviewer surface built here has no other
   * zone to show it in (§10.1) — the in-flight list and Alerts are #73/#74.
   */
  async getDetail(id: string, now: Date): Promise<RequestDetail | null> {
    const { db } = this.appDb;

    // Queue position (§13.3's "how many Requests are ahead") is read from
    // the same ordering the queue itself uses, so the two can never disagree.
    const pendingOrder = await db
      .select({ id: request.id })
      .from(request)
      .where(eq(request.state, "pending"))
      .orderBy(asc(request.submittedAt));
    const requestsAhead = pendingOrder.findIndex((row) => row.id === id);
    if (requestsAhead === -1) return null;

    const [row] = await db
      .select({
        id: request.id,
        referenceNumber: request.referenceNumber,
        diseaseGroupNameTh: request.diseaseGroupNameTh,
        reportCodes: request.reportCodes,
        fromDate: request.fromDate,
        toDate: request.toDate,
        areaKind: request.areaKind,
        areaProvinces: request.areaProvinces,
        submittedAt: request.submittedAt,
        name: requestContact.name,
        surname: requestContact.surname,
        tel: requestContact.tel,
        email: requestContact.email,
        workplace: requestContact.workplace,
      })
      .from(request)
      .innerJoin(requestContact, eq(requestContact.requestId, request.id))
      .where(eq(request.id, id));

    // Guards a request deleted between the two queries above — never
    // observed in this system (nothing deletes a Request row), but cheaper
    // to check than to assume.
    if (!row) return null;

    const area = await this.areaViewOf(row.areaKind, row.areaProvinces);
    const probeRowCount = await this.probeRowCountOf(id);

    return {
      id: row.id,
      referenceNumber: row.referenceNumber,
      contact: {
        name: row.name,
        surname: row.surname,
        tel: row.tel,
        email: row.email,
        workplace: row.workplace,
      },
      diseaseGroupNameTh: row.diseaseGroupNameTh,
      reportCodes: row.reportCodes,
      fromDate: row.fromDate,
      toDate: row.toDate,
      days: validateSpan(row.fromDate, row.toDate).days,
      area,
      submittedAt: row.submittedAt.toISOString(),
      decisionDueAt: addBusinessHours(
        row.submittedAt,
        DECISION_WINDOW_HOURS,
      ).toISOString(),
      ...decisionWindowView(row.submittedAt, now, DECISION_WINDOW_HOURS),
      requestsAhead,
      probeRowCount,
    };
  }

  /**
   * `"pending"` before the Probe has recorded anything, `"failed"` once it
   * was abandoned, or its summed total once it landed (§5.4) — read from the
   * audit spine, never from a column on `request` itself: `app_role` holds
   * no UPDATE grant on that table (§12.3), so nothing but an insert-only
   * event stream could carry this forward.
   */
  private async probeRowCountOf(
    id: string,
  ): Promise<number | "pending" | "failed"> {
    const { db } = this.appDb;
    const [event] = await db
      .select({ type: requestEvent.type, payload: requestEvent.payload })
      .from(requestEvent)
      .where(
        and(
          eq(requestEvent.requestId, id),
          inArray(requestEvent.type, ["probe_performed", "probe_failed"]),
        ),
      )
      .orderBy(desc(requestEvent.id))
      .limit(1);

    if (!event) return "pending";
    if (event.type === "probe_failed") return "failed";

    return (event.payload as ProbePerformedPayload).totalItems;
  }

  // Never the bare region (§4.4, §12.3): a region Request stores the
  // province list it expanded to at submit, so the region number shown here
  // is derived from that frozen list's own health region, not stored raw.
  private async areaViewOf(
    kind: AreaKind,
    areaProvinces: string[],
  ): Promise<AreaView> {
    if (kind === "national")
      return { kind: "national", label: "Whole country" };

    const { db } = this.appDb;
    const [first] = await db
      .select({ nameTh: province.nameTh, healthRegion: province.healthRegion })
      .from(province)
      .where(eq(province.provinceId, areaProvinces[0]));

    if (kind === "province") {
      return { kind: "province", label: first?.nameTh ?? areaProvinces[0] };
    }
    return {
      kind: "region",
      label: `Health region ${first?.healthRegion ?? "?"}`,
    };
  }
}
