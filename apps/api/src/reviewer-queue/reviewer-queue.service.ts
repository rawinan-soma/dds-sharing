import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import { province, request, requestContact, requestEvent } from "../db/schema.js";
import { countActiveReviewers } from "../auth/reviewer.repository.js";
import { MailService } from "../mail/mail.service.js";
import { buildRejectionEmail } from "../mail/rejection-email.js";
import { ExtractionQueueService } from "../extraction/extraction-queue.service.js";
import { m } from "../paraglide/messages.js";
import type { ProbePerformedPayload, Snapshot } from "../db/events.js";
import type { AreaKind } from "../requests/request-state.js";
import { validateSpan } from "../requests/span.js";
import { addBusinessHours, businessHoursBetween, decisionWindowView } from "./business-hours.js";
import type {
  AmendNoteOutcome,
  AreaView,
  DecisionOutcome,
  ProbeRowCount,
  QueueRow,
  RequestDetail,
} from "./reviewer-queue.types.js";

// Request expiry at 24 business hours (spec §10.4): a predicate computed at
// read time, never a scheduled state change, so a Request past this
// threshold is simply not actionable — and a dead scheduler can never
// un-expire one, because nothing ever wrote "expired" to make it actionable
// again in the first place.
const DECISION_WINDOW_HOURS = 24;

// Design handoff, screen 7b: the internal note is "required, min 10
// characters" — enforced here too, not only in the form, since the note is
// never shown or checked by anyone else before it lands on a permanent
// record.
const MIN_INTERNAL_NOTE_LENGTH = 10;

@Injectable()
export class ReviewerQueueService {
  constructor(
    @Inject(APP_DB) private readonly appDb: AppDb,
    private readonly mailService: MailService,
    private readonly extractionQueueService: ExtractionQueueService,
  ) {}

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
  private async probeRowCountOf(id: string): Promise<ProbeRowCount> {
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

  /**
   * The Decision (spec §10.3): approve releases the Request from `pending`
   * to `queued`, and carries a Snapshot. Once the Decision itself is
   * committed, this enqueues the extraction job (§7.7) — outside the
   * transaction, same reasoning as `reject`'s email: a BullMQ enqueue is an
   * external side effect that must never run inside a transaction that
   * might yet roll back.
   */
  async approve(id: string, reviewerId: string, now: Date): Promise<DecisionOutcome> {
    const outcome = await this.decide(id, now, async (tx, row, snapshot) => {
      await tx.update(request).set({ state: "queued" }).where(eq(request.id, id));
      await tx.insert(requestEvent).values({
        requestId: id,
        type: "approved",
        actorType: "reviewer",
        reviewerId,
        payload: { snapshot },
        occurredAt: now,
      });
      return { kind: "approved" as const, decidedAt: now.toISOString() };
    });

    if (outcome.kind === "approved") {
      await this.extractionQueueService.enqueue(id, now);
    }

    return outcome;
  }

  /**
   * The Decision (spec §10.3): reject moves the Request to `rejected`,
   * carries a Snapshot and the mandatory internal note, and — once the
   * Decision itself is committed — attempts the no-reason rejection email
   * once. A failed send never undoes the Decision: it is written as its own
   * event, and the retry-and-Alert machinery (§11.3) is the scheduled
   * tick's job (#72), not this one's.
   */
  async reject(id: string, reviewerId: string, note: string, now: Date): Promise<DecisionOutcome> {
    if (note.trim().length < MIN_INTERNAL_NOTE_LENGTH) return { kind: "note_too_short" };

    const outcome = await this.decide(id, now, async (tx, row, snapshot) => {
      await tx.update(request).set({ state: "rejected" }).where(eq(request.id, id));
      await tx.insert(requestEvent).values({
        requestId: id,
        type: "rejected",
        actorType: "reviewer",
        reviewerId,
        payload: { snapshot, internalNote: note },
        occurredAt: now,
      });
      return {
        kind: "rejected" as const,
        decidedAt: now.toISOString(),
        contactEmail: row.email,
        referenceNumber: row.referenceNumber,
      };
    });

    if (outcome.kind !== "rejected") return outcome;

    const email = buildRejectionEmail({
      referenceNumber: outcome.referenceNumber,
      telephone: m.requester_service_telephone(),
    });
    const sendResult = await this.mailService.send({ to: outcome.contactEmail, subject: email.subject, text: email.text });
    await this.recordRejectionMailOutcome(id, outcome.contactEmail, sendResult);

    return { kind: "rejected", decidedAt: outcome.decidedAt };
  }

  /**
   * One try, one event — the retry-and-Alert machinery (§11.3) is the
   * scheduled tick's job (#72), not a Decision's. Named for the rejection
   * email specifically: the Delivery and extraction-failure mail kinds
   * belong to later tickets' own services, not this one.
   */
  private async recordRejectionMailOutcome(
    requestId: string,
    to: string,
    sendResult: Awaited<ReturnType<MailService["send"]>>,
  ): Promise<void> {
    const { db } = this.appDb;
    await db.insert(requestEvent).values(
      sendResult.outcome === "sent"
        ? {
            requestId,
            type: "mail_sent",
            actorType: "system",
            payload: { kind: "rejection", to, relayResponse: sendResult.relayResponse },
            occurredAt: new Date(),
          }
        : {
            requestId,
            type: "mail_send_failed",
            actorType: "system",
            payload: { tryNumber: 1, relayError: sendResult.error },
            occurredAt: new Date(),
          },
    );
  }

  /**
   * The shared spine of every Decision (spec §10.3, §10.4): locks the
   * pending row, refuses anything not still pending, and re-derives elapsed
   * business hours before doing anything else — the 24-hour expiry is
   * enforced at the moment of decision, not only by a sweeper. `apply` runs
   * inside the same transaction and only ever sees a Request that is both
   * pending and still inside its window.
   */
  private async decide<T extends { kind: string }>(
    id: string,
    now: Date,
    apply: (
      tx: Tx,
      row: { email: string; referenceNumber: string },
      snapshot: Snapshot,
    ) => Promise<T>,
  ): Promise<T | { kind: "not_found" } | { kind: "not_pending" } | { kind: "expired"; expiredAt: string }> {
    const { db } = this.appDb;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          state: request.state,
          referenceNumber: request.referenceNumber,
          diseaseGroupNameTh: request.diseaseGroupNameTh,
          reportCodes: request.reportCodes,
          fromDate: request.fromDate,
          toDate: request.toDate,
          areaKind: request.areaKind,
          areaProvinces: request.areaProvinces,
          submittedAt: request.submittedAt,
          email: requestContact.email,
          workplace: requestContact.workplace,
        })
        .from(request)
        .innerJoin(requestContact, eq(requestContact.requestId, request.id))
        .where(eq(request.id, id))
        // Locked to `request` alone (`of: request`) — `FOR UPDATE` on the
        // join would also need it to lock `request_contact`, which needs
        // Postgres's UPDATE privilege to lock, and app_role has none there
        // (§12.2: the contact fields are read-only to the application).
        // Locking `request` is enough: every concurrent Decision serializes
        // on that row regardless.
        .for("update", { of: request });

      if (!row) return { kind: "not_found" };
      if (row.state !== "pending") return { kind: "not_pending" };

      const businessHoursElapsed = businessHoursBetween(row.submittedAt, now);
      if (businessHoursElapsed >= DECISION_WINDOW_HOURS) {
        const expiredAt = addBusinessHours(row.submittedAt, DECISION_WINDOW_HOURS);
        const reviewerAccountsActive = await countActiveReviewers(tx);
        await tx.update(request).set({ state: "expired" }).where(eq(request.id, id));
        await tx.insert(requestEvent).values({
          requestId: id,
          type: "expired",
          actorType: "system",
          payload: {
            notifiedAt: now.toISOString(),
            businessHoursElapsed,
            reviewerAccountsActive,
            decisionAttemptedAndRefused: true,
          },
          occurredAt: expiredAt,
        });
        return { kind: "expired", expiredAt: expiredAt.toISOString() };
      }

      const area = await this.snapshotAreaOf(row.areaKind, row.areaProvinces);
      const snapshot: Snapshot = {
        diseaseGroupName: row.diseaseGroupNameTh,
        reportCodes: row.reportCodes,
        startDate: row.fromDate,
        endDate: row.toDate,
        area,
        // Honest placeholder, same reasoning as RequestDetail.probeRowCount
        // (ticket #65): the Probe is #68's. "pending" is the one value of
        // the closed three that is actually true right now — the Probe has
        // not run, so its outcome is unknown, never a fabricated number.
        probeRowCount: "pending",
        workplace: row.workplace,
      };

      return apply(tx, { email: row.email, referenceNumber: row.referenceNumber }, snapshot);
    });
  }

  private async snapshotAreaOf(kind: AreaKind, areaProvinces: string[]): Promise<Snapshot["area"]> {
    if (kind === "national") return { kind: "national" };

    const { db } = this.appDb;
    const [first] = await db
      .select({ nameTh: province.nameTh, healthRegion: province.healthRegion })
      .from(province)
      .where(eq(province.provinceId, areaProvinces[0]));

    if (kind === "province") {
      return { kind: "province", province: first?.nameTh ?? areaProvinces[0] };
    }
    return { kind: "region", region: first?.healthRegion ?? 0 };
  }

  /**
   * A mistyped internal note is corrected by a `note_amended` event citing
   * the one it corrects (spec §12.2, §12.3) — never by editing the
   * `rejected` event itself, which no role can do (§12.2). There is no
   * Reviewer surface for this yet: a rejected Request leaves the queue for
   * good at the Decision (§10.3), so this is reachable only for a Reviewer
   * who is still looking at the Request they just rejected.
   */
  async amendNote(id: string, reviewerId: string, note: string, now: Date): Promise<AmendNoteOutcome> {
    if (note.trim().length < MIN_INTERNAL_NOTE_LENGTH) return { kind: "note_too_short" };

    const { db } = this.appDb;
    return db.transaction(async (tx) => {
      const [current] = await tx.select({ state: request.state }).from(request).where(eq(request.id, id)).for("update");
      if (!current || current.state !== "rejected") return { kind: "not_rejected" };

      // The event this amendment cites — the original `rejected` event, or
      // the most recent prior correction of it (§12.2's "a correction is a
      // new event citing the prior one").
      const [cited] = await tx
        .select({ id: requestEvent.id })
        .from(requestEvent)
        .where(and(eq(requestEvent.requestId, id), inArray(requestEvent.type, ["rejected", "note_amended"])))
        .orderBy(desc(requestEvent.id))
        .limit(1);
      // A `rejected` state always has a `rejected` event behind it — written
      // in the same transaction that set it (reject(), above).

      await tx.insert(requestEvent).values({
        requestId: id,
        type: "note_amended",
        actorType: "reviewer",
        reviewerId,
        payload: { citesEventId: cited!.id, note },
        occurredAt: now,
      });
      return { kind: "amended" };
    });
  }
}

// The transaction-scoped query client `db.transaction(async (tx) => ...)`
// hands its callback — mirrors requests.service.ts's own Tx alias.
type Tx = Parameters<Parameters<AppDb["db"]["transaction"]>[0]>[0];
