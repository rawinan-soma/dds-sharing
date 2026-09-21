import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  char,
  check,
  date,
  index,
  inet,
  jsonb,
  pgEnum,
  pgSequence,
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
import { REQUEST_STATES } from '../requests/request-state';

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

export const requestState = pgEnum('request_state', REQUEST_STATES);

// The reference number's counter (spec §12.5). One sequence, never reset: the
// shape `REQ-2569-0142` fixes the year and the padding, and what the counter
// resets on is left to the implementer. A sequence cannot collide under
// concurrent submits, which a per-year counter would have to be made to do.
export const requestReferenceSeq = pgSequence('request_reference_seq');

// The Request (spec §12.3): the ask and its state, and **no identifying data** —
// the contact fields live in `request_contact`, and the requester's IP is on
// the `submitted` event. It stores both forms of the ask: what the human chose
// (inclusive dates, the group's name) and the two expansions, which are
// authoritative because both taxonomies are amendable.
export const request = pgTable(
  'request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // A display label; the UUID is the key.
    reference: text('reference').notNull().unique(),
    state: requestState('state').notNull().default('pending'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    diseaseGroupId: text('disease_group_id').notNull(),
    diseaseGroupName: text('disease_group_name').notNull(),
    // Inclusive, as the human gave them. Upstream's half-open end
    // date never appears here (§4.3); the span builder is its only home.
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    reportCodes: text('report_codes').array().notNull(),
    // Empty means national. Never a region: a region is expanded before storing.
    provinces: char('provinces', { length: 2 }).array().notNull(),
  },
  (t) => [
    check(
      'request_report_codes_nonempty',
      sql`cardinality(${t.reportCodes}) > 0`,
    ),
    check('request_dates_ordered', sql`${t.startDate} <= ${t.endDate}`),
    // Belt to the server's braces: the cap is upstream's, and a row that broke
    // it could never be fetched.
    check('request_span_cap', sql`${t.endDate} - ${t.startDate} <= 365`),
  ],
);

// Split out so every other query touches no personal data (§12.3). No role
// holds UPDATE here (§12.2): a contact detail is never rewritten (ADR 0019).
export const requestContact = pgTable('request_contact', {
  requestId: uuid('request_id')
    .primaryKey()
    .references(() => request.id),
  name: text('name').notNull(),
  surname: text('surname').notNull(),
  tel: text('tel').notNull(),
  email: text('email').notNull(),
  workplace: text('workplace').notNull(),
});

export const requestEvent = pgTable(
  'request_event',
  {
    ...eventColumns(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id),
    type: requestEventType('type').notNull(),
  },
  (table) => [
    ...actorChecks(table),
    // Duplicate suppression asks "which Requests came from this IP".
    index('request_event_submitted_ip')
      .on(table.ip)
      .where(sql`${table.type} = 'submitted'`),
  ],
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
