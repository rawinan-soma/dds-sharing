import { sql } from "drizzle-orm";
import { bigserial, check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ACTOR_TYPES, REQUEST_EVENT_TYPES, REVIEWER_EVENT_TYPES } from "./events.js";

// The audit spine (spec §12). Two append-only streams, kept apart because they
// belong to different things: request_event for what happened to a Request,
// reviewer_event for what a Reviewer did that belongs to no Request. Neither
// table grants the application role DELETE — see the roles-and-grants
// migration and events.ts for the closed catalogue these enums mirror.

export const actorType = pgEnum("actor_type", ACTOR_TYPES);
export const requestEventType = pgEnum("request_event_type", REQUEST_EVENT_TYPES);
export const reviewerEventType = pgEnum("reviewer_event_type", REVIEWER_EVENT_TYPES);

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
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("request_event_request_id_idx").on(table.requestId),
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
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("reviewer_event_reviewer_id_idx").on(table.reviewerId)],
);
