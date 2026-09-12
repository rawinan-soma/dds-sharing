import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import {
  province,
  request,
  requestContact,
  requestEvent,
  referenceNumberCounter,
} from "../db/schema.js";
import { DISEASE_GROUPS } from "../reference-data/disease-groups.js";
import {
  UNFINISHED_REQUEST_STATES,
  type RequestState,
} from "./request-state.js";
import { buddhistYearOf, formatReferenceNumber } from "./reference-number.js";
import { validateSubmitRequest } from "./validate-submit-request.js";
import type {
  NormalizedArea,
  SubmitRequestInput,
  ValidationError,
} from "./submit-request.types.js";

export interface SubmitMeta {
  ip: string;
  userAgent: string;
}

export interface SubmittedOutcome {
  kind: "submitted";
  referenceNumber: string;
  diseaseGroupNameTh: string;
  from: string;
  to: string;
  days: number;
  area: NormalizedArea;
}

export interface DuplicateOutcome {
  kind: "duplicate";
  existingReferenceNumber: string;
  existingState: RequestState;
  existingSubmittedAt: Date;
}

export interface ValidationFailedOutcome {
  kind: "validation_error";
  errors: ValidationError[];
}

export type SubmitOutcome =
  SubmittedOutcome | DuplicateOutcome | ValidationFailedOutcome;

// The transaction-scoped query client `db.transaction(async (tx) => ...)`
// hands its callback — distinct from AppDb["db"] itself (no `$client`).
type Tx = Parameters<Parameters<AppDb["db"]["transaction"]>[0]>[0];

@Injectable()
export class RequestsService {
  constructor(@Inject(APP_DB) private readonly appDb: AppDb) {}

  async submit(
    input: SubmitRequestInput,
    meta: SubmitMeta,
  ): Promise<SubmitOutcome> {
    const { db } = this.appDb;

    // Skip the round trip on the ~77-row province lookup entirely for a
    // national request (the common case) — nothing in validateSubmitRequest
    // reads `provinces` unless area.kind is "province" or "region".
    const needsProvinces =
      input.area?.kind === "province" || input.area?.kind === "region";
    const provinces = needsProvinces ? await db.select().from(province) : [];

    const validated = validateSubmitRequest(input, DISEASE_GROUPS, provinces);
    if (!validated.ok) {
      return { kind: "validation_error", errors: validated.errors };
    }
    const value = validated.value;
    const now = new Date();

    // Everything from here — the duplicate check, the reference-number
    // counter, and the three inserts — runs in one transaction: either all
    // of it lands or none of it does, so a failure partway through can never
    // burn a reference number or half-write a Request. The advisory lock is
    // scoped to this IP and held only for the transaction's lifetime
    // (`_xact_lock`, auto-released at commit/rollback) — it serializes two
    // near-simultaneous submits from the same origin against each other, so
    // a double-posted form can no longer slip both copies past the §4.8
    // duplicate check in the race between one's SELECT and its own INSERT.
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${meta.ip}))`);

      const [duplicate] = await tx
        .select({
          referenceNumber: request.referenceNumber,
          state: request.state,
          submittedAt: request.submittedAt,
        })
        .from(request)
        .innerJoin(
          requestEvent,
          and(
            eq(requestEvent.requestId, request.id),
            eq(requestEvent.type, "submitted"),
          ),
        )
        .where(
          and(
            eq(requestEvent.ip, meta.ip),
            inArray(request.state, UNFINISHED_REQUEST_STATES),
          ),
        )
        .orderBy(desc(request.submittedAt))
        .limit(1);

      if (duplicate) {
        return {
          kind: "duplicate",
          existingReferenceNumber: duplicate.referenceNumber,
          existingState: duplicate.state,
          existingSubmittedAt: duplicate.submittedAt,
        };
      }

      const referenceNumber = await this.nextReferenceNumber(tx, now);

      const [inserted] = await tx
        .insert(request)
        .values({
          referenceNumber,
          diseaseGroupId: value.diseaseGroupId,
          diseaseGroupNameTh: value.diseaseGroupNameTh,
          reportCodes: value.reportCodes,
          fromDate: value.from,
          toDate: value.to,
          areaKind: value.area.kind,
          areaRegion: value.area.kind === "region" ? value.area.region : null,
          areaProvinces:
            value.area.kind === "province"
              ? [value.area.provinceId]
              : value.area.kind === "region"
                ? value.area.provinces.map((p) => p.provinceId)
                : [],
          submittedAt: now,
        })
        .returning({ id: request.id });

      await tx.insert(requestContact).values({
        requestId: inserted.id,
        name: value.contact.name,
        surname: value.contact.surname,
        tel: value.contact.tel,
        email: value.contact.email,
        workplace: value.contact.workplace,
      });

      await tx.insert(requestEvent).values({
        requestId: inserted.id,
        type: "submitted",
        actorType: "requester",
        ip: meta.ip,
        userAgent: meta.userAgent,
        occurredAt: now,
      });

      return {
        kind: "submitted",
        referenceNumber,
        diseaseGroupNameTh: value.diseaseGroupNameTh,
        from: value.from,
        to: value.to,
        days: value.days,
        area: value.area,
      };
    });
  }

  private async nextReferenceNumber(tx: Tx, at: Date): Promise<string> {
    const year = buddhistYearOf(at);

    const [row] = await tx
      .insert(referenceNumberCounter)
      .values({ year, counter: 1 })
      .onConflictDoUpdate({
        target: referenceNumberCounter.year,
        // The row's own current value, read and incremented atomically under
        // Postgres's upsert row lock — no separate advisory lock needed for
        // the counter itself (schema.ts).
        set: { counter: sql`${referenceNumberCounter.counter} + 1` },
      })
      .returning({ counter: referenceNumberCounter.counter });

    return formatReferenceNumber(year, row.counter);
  }
}
