import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  check,
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
import { ACTOR_TYPES, REQUEST_EVENT_TYPES, REVIEWER_EVENT_TYPES } from "./events.js";

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

// Reviewer identity (spec §17.5, ticket #64). Seeded by a CLI ceremony on the
// Docker host — there is no self-service sign-up. `totpConfirmedAt` null means
// "inert": the account cannot sign in until one TOTP code has confirmed
// enrolment. `totpLastUsedStep` blocks replay of an already-spent code within
// the ±1-step validation window. `deactivatedAt` is the only way a Reviewer
// stops being able to sign in — the row is never deleted, because
// `display_name` stays on every Decision permanently.
export const reviewer = pgTable("reviewer", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret").notNull(),
  totpConfirmedAt: timestamp("totp_confirmed_at", { withTimezone: true, mode: "date" }),
  totpLastUsedStep: bigint("totp_last_used_step", { mode: "number" }),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// Sessions live in Postgres, not Redis (spec §17.5): deactivation is a query,
// not a cache-invalidation problem, and a restart cannot resurrect state that
// matters. `tokenHash` — never the raw cookie value — is the lookup key, so a
// database read never discloses a live session token. `absoluteExpiresAt` is
// fixed at creation and is never rewritten; only `lastSeenAt` slides.
export const reviewerSession = pgTable(
  "reviewer_session",
  {
    tokenHash: text("token_hash").primaryKey(),
    reviewerId: uuid("reviewer_id").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("reviewer_session_reviewer_id_idx").on(table.reviewerId)],
);

// Sign-in throttle state (spec §17.5): exponential backoff per account *and*
// per IP, capped near 30 seconds, surviving a restart because it lives here
// rather than in a cache. `key` is either `account:<username>` or `ip:<ip>` —
// two independent rows guard the same attempt, and neither can lock anyone
// out on its own (there is no lockout, only a growing delay).
export const reviewerLoginThrottle = pgTable("reviewer_login_throttle", {
  key: text("key").primaryKey(),
  failureCount: integer("failure_count").notNull().default(0),
  nextAllowedAt: timestamp("next_allowed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
