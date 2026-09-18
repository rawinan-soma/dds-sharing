import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  char,
  check,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACTOR_TYPES,
  REQUEST_EVENT_TYPES,
  REVIEWER_EVENT_TYPES,
  UNAUTHENTICATED_ACTOR_TYPES,
} from '../audit/event-catalogue';

// The audit spine (spec §12.2). Both tables are append-only. That is enforced
// by the database, not by convention: the application role `dds_app` holds
// INSERT and SELECT here and nothing else (see the hand-written grants in
// migrations/0001_audit_spine.sql, which drizzle-kit cannot express).

export const actorType = pgEnum('actor_type', ACTOR_TYPES);
export const requestEventType = pgEnum(
  'request_event_type',
  REQUEST_EVENT_TYPES,
);
export const reviewerEventType = pgEnum(
  'reviewer_event_type',
  REVIEWER_EVENT_TYPES,
);

// Timestamps are timestamptz, stored in UTC and rendered in ICT at the edge.
// The sequence (`id`) answers "in what order"; the timestamps answer "when".
// `occurred_at` is when the predicate became true (the legally meaningful one)
// and has no default so a writer can never silently stamp it with the insert
// time; `recorded_at` is the insert. Where they diverge, that is the outage
// record.
const eventColumns = () => ({
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: actorType('actor_type').notNull(),
  // Set only for `reviewer`. The reviewer table arrives with a later ticket,
  // which adds the foreign key.
  reviewerId: uuid('reviewer_id'),
  // Set only for the unauthenticated actor kinds.
  ip: inet('ip'),
  userAgent: text('user_agent'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  payload: jsonb('payload').notNull().default({}),
});

const actorChecks = (table: {
  actorType: AnyPgColumn;
  reviewerId: AnyPgColumn;
  ip: AnyPgColumn;
  userAgent: AnyPgColumn;
}) => [
  check(
    'actor_reviewer_id',
    sql`(${table.actorType} = 'reviewer') = (${table.reviewerId} IS NOT NULL)`,
  ),
  check(
    'actor_ip_user_agent',
    sql`${table.actorType} IN (${sql.raw(UNAUTHENTICATED_ACTOR_TYPES.map((t) => `'${t}'`).join(', '))})
        OR (${table.ip} IS NULL AND ${table.userAgent} IS NULL)`,
  ),
];

export const requestEvent = pgTable(
  'request_event',
  {
    ...eventColumns(),
    // The request table arrives with a later ticket, which adds the foreign key.
    requestId: uuid('request_id').notNull(),
    type: requestEventType('type').notNull(),
  },
  (table) => actorChecks(table),
);

export const reviewerEvent = pgTable(
  'reviewer_event',
  {
    ...eventColumns(),
    type: reviewerEventType('type').notNull(),
  },
  (table) => actorChecks(table),
);

// The seeded province lookup (spec §6.4). Seeded by a migration generated from
// docs/provinces.csv; the application role is read-only on it.
export const province = pgTable(
  'province',
  {
    provinceId: char('province_id', { length: 2 }).primaryKey(),
    nameTh: text('name_th').notNull(),
    healthRegion: smallint('health_region').notNull(),
  },
  (t) => [
    check('province_id_two_digits', sql`${t.provinceId} ~ '^[0-9]{2}$'`),
    check(
      'province_health_region_range',
      sql`${t.healthRegion} BETWEEN 1 AND 13`,
    ),
  ],
);
