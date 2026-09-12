import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  ACTOR_TYPES,
  REQUEST_EVENT_TYPES,
  REVIEWER_EVENT_TYPES,
} from "./events.js";
import { REQUEST_STATES, AREA_KINDS } from "../requests/request-state.js";

// The 77-row province lookup (spec §6.4, ADR 0002). `docs/provinces.csv`
// stays canonical — this table is generated from it and never edited by
// hand. `province_id` is a code, not a quantity (§4.6: codes occupy 10-96,
// uniformly two digits), so it stays a string.
export const province = pgTable("province", {
  provinceId: varchar("province_id", { length: 2 }).primaryKey(),
  nameTh: text("name_th").notNull(),
  healthRegion: integer("health_region").notNull(),
});

// The audit spine (spec §12). Two append-only streams, kept apart because they
// belong to different things: request_event for what happened to a Request,
// reviewer_event for what a Reviewer did that belongs to no Request. Neither
// table grants the application role DELETE — see the roles-and-grants
// migration and events.ts for the closed catalogue these enums mirror.

export const actorType = pgEnum("actor_type", ACTOR_TYPES);
export const requestEventType = pgEnum(
  "request_event_type",
  REQUEST_EVENT_TYPES,
);
export const reviewerEventType = pgEnum(
  "reviewer_event_type",
  REVIEWER_EVENT_TYPES,
);

export const requestEvent = pgTable(
  "request_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: uuid("request_id").notNull(),
    type: requestEventType("type").notNull(),
    actorType: actorType("actor_type").notNull(),
    // Discriminated actor (§12.2): reviewerId set iff actor_type = 'reviewer';
    // ip/userAgent set iff actor_type is one of the unauthenticated kinds
    // (`requester`, `anonymous`) — every event of those kinds carries both,
    // per the catalogue in events.ts, so "only for" is enforced both ways.
    reviewerId: uuid("reviewer_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    payload: jsonb("payload").notNull().default({}),
    // Two timestamps on every late-materialised event: occurredAt is the moment
    // the predicate became true (legally meaningful); recordedAt is the insert.
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("request_event_request_id_idx").on(table.requestId),
    // Backs the duplicate-suppression lookup (§4.8): "does this IP already
    // have a submitted event on an unfinished Request?" runs on every submit.
    index("request_event_type_ip_idx").on(table.type, table.ip),
    check(
      "request_event_reviewer_id_iff_reviewer",
      sql`(${table.actorType} = 'reviewer') = (${table.reviewerId} IS NOT NULL)`,
    ),
    check(
      "request_event_ip_iff_unauth",
      sql`(${table.actorType} IN ('requester', 'anonymous')) = (${table.ip} IS NOT NULL)`,
    ),
    check(
      "request_event_user_agent_iff_unauth",
      sql`(${table.actorType} IN ('requester', 'anonymous')) = (${table.userAgent} IS NOT NULL)`,
    ),
  ],
);

export const reviewerEvent = pgTable(
  "reviewer_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reviewerId: uuid("reviewer_id").notNull(),
    type: reviewerEventType("type").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("reviewer_event_reviewer_id_idx").on(table.reviewerId)],
);

// The Request (spec §4, §12.3). Carries no identifying data — contact
// fields live in request_contact, a separate table (§12.3's "why
// request_contact is split out").
export const requestState = pgEnum("request_state", REQUEST_STATES);
export const areaKind = pgEnum("area_kind", AREA_KINDS);

export const request = pgTable(
  "request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Display label only (§12.5) — the id above is the key every foreign key
    // uses.
    referenceNumber: text("reference_number").notNull().unique(),
    state: requestState("state").notNull().default("pending"),

    // Human form, as the Requester asked (§12.3): the Disease group's stable
    // id (never changes) plus its name at submit time (frozen — a later
    // rename must not rewrite what this Requester saw).
    diseaseGroupId: text("disease_group_id").notNull(),
    diseaseGroupNameTh: text("disease_group_name_th").notNull(),
    // Upstream form, authoritative (§4.9, §12.3): the Report codes the group
    // expanded to at submit. A Re-run refetches these, never what the group
    // means today.
    reportCodes: text("report_codes").array().notNull(),

    // Inclusive to the human (§4.3) — the `+1 day` conversion for upstream's
    // half-open interval happens only in the span builder, never here.
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),

    // Area selection (§4.4): national is the default and stores no region or
    // provinces. A province selection freezes a one-entry list; a region
    // selection freezes the province list it expanded to at submit and keeps
    // the region number only as the human form of the ask — the stored
    // Request never names a bare region (§4.4, §4.9).
    areaKind: areaKind("area_kind").notNull().default("national"),
    areaRegion: integer("area_region"),
    areaProvinces: text("area_provinces").array().notNull().default([]),

    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "request_area_region_iff_region_kind",
      sql`(${table.areaKind} = 'region') = (${table.areaRegion} IS NOT NULL)`,
    ),
  ],
);

// Split out from `request` (§12.3) — the only reader that needs these
// fields is the Reviewer surface, reading one Request at a time.
export const requestContact = pgTable("request_contact", {
  requestId: uuid("request_id")
    .primaryKey()
    .references(() => request.id),
  name: text("name").notNull(),
  surname: text("surname").notNull(),
  tel: text("tel").notNull(),
  email: text("email").notNull(),
  workplace: text("workplace").notNull(),
});

// Backs the reference number's per-year counter (§12.5). "What the counter
// resets on is an implementer's choice" — this implementation resets it on
// the Buddhist calendar year. Rows are upserted with
// `ON CONFLICT ... DO UPDATE`, which serializes concurrent submits in the
// same year on Postgres's own row lock — no advisory lock needed.
export const referenceNumberCounter = pgTable("reference_number_counter", {
  year: integer("year").primaryKey(),
  counter: integer("counter").notNull().default(0),
});
