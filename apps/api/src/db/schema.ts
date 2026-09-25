import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  inet,
  integer,
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
  MAIL_KINDS,
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

// A Reviewer is never removed, only deactivated (`deactivated_at`): their
// display name stays on every Decision. The application role holds no DELETE
// here, and UPDATE only on the columns that legitimately change, so the name a
// Decision carries cannot be rewritten either (grants: migration 0005).
export const reviewer = pgTable(
  'reviewer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull().unique(),
    // The person's real name, prompted for at seeding. Unerasable by design.
    displayName: text('display_name').notNull(),
    // Queue notification only; never a password-reset address (§17.5).
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // True from seeding until the first self-service change.
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    totpSecret: text('totp_secret').notNull(),
    // Null until one code has confirmed enrolment. A seeded-but-unconfirmed
    // account is inert.
    totpConfirmedAt: timestamp('totp_confirmed_at', { withTimezone: true }),
    // The newest TOTP step spent, so a used code cannot be replayed.
    totpLastUsedStep: bigint('totp_last_used_step', { mode: 'number' }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'reviewer_username_format',
      sql`${t.username} ~ '^[a-z0-9._-]{3,32}$'`,
    ),
  ],
);

// Operational state, genuinely deletable (spec §12.3, §15.4). In Postgres, not
// Redis: deactivation is a query, and a flush cannot resurrect anything.
export const reviewerSession = pgTable(
  'reviewer_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 of the cookie value; the cookie itself is never stored.
    tokenHash: text('token_hash').notNull().unique(),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => reviewer.id),
    // The 6-hour ceiling counts from here and is never extended.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    // The 1-hour idle window counts from here; user-initiated requests move it.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('reviewer_session_reviewer_id_idx').on(t.reviewerId)],
);

// Failed-sign-in backoff, one row per account and one per IP. No row ever locks
// anything: it only says when the next attempt is allowed.
export const loginThrottle = pgTable('login_throttle', {
  // `account:<username>` or `ip:<address>`.
  key: text('key').primaryKey(),
  failures: integer('failures').notNull(),
  nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// Timestamps are timestamptz, stored in UTC and rendered in ICT at the edge.
// The sequence (`id`) answers "in what order"; the timestamps answer "when".
// `occurred_at` is when the predicate became true (the legally meaningful one)
// and has no default so a writer can never silently stamp it with the insert
// time; `recorded_at` is the insert. Where they diverge, that is the outage
// record.
const eventColumns = () => ({
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: actorType('actor_type').notNull(),
  // Set only for `reviewer`.
  reviewerId: uuid('reviewer_id').references(() => reviewer.id),
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

// The extraction job (spec §7.7): BullMQ executes, this table is the system of
// record. A row is written at approval and moves queued -> running -> one of
// succeeded/failed; the tick's reconcile — at startup, and on every pass once a
// row has shown no progress for the stall window — re-enqueues any row left
// `queued`/`running` with no live BullMQ job (never touching `pending` — that
// state does not exist here at all).
//
// `succeeded` means the whole job held: fetch -> filter -> project ->
// completeness, then the Extract archive written, fingerprinted, uploaded to
// MinIO in one operation, and `job_completed` written (#70). A failure at any
// of those steps is `failed`, never a status between the two — there is no
// "extracted but not yet published" state to leave stranded.
export const extractionJobStatus = pgEnum('extraction_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
]);

export const extractionJob = pgTable(
  'extraction_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id),
    status: extractionJobStatus('status').notNull().default('queued'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // Touched each time a Report code finishes fetch -> filter -> project; the
    // stall watchdog measures against this, not against `startedAt` (spec §7.6).
    lastProgressAt: timestamp('last_progress_at', { withTimezone: true }),
    // Counts and identifiers only — never a case row (the retained premise:
    // surveillance data is never stored at rest). What the future writer and
    // `job_completed` need: per-code counts, the unknown-field names seen, the
    // impossible-derivation count, and the upstream `x-request-id`s.
    result: jsonb('result'),
    failureCause: text('failure_cause'),
  },
  (t) => [index('extraction_job_request_id_idx').on(t.requestId)],
);

// The Download token (spec §9.2, §9.3): operational, like `extraction_job` —
// updated in place (only `revoked_at`, by a Re-run at ready, ADR 0012), never
// deleted. The raw token is never stored, only its hash (mirrors
// `reviewer_session.token_hash`); `archive_filename` is the object key in
// MinIO so the archive route never has to re-derive it.
export const downloadToken = pgTable(
  'download_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id),
    tokenHash: text('token_hash').notNull().unique(),
    archiveFilename: text('archive_filename').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    // 72 hours from job completion (§9.3), never extended by use or resend.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('download_token_request_id_idx').on(t.requestId)],
);

export const tokenLookupKind = pgEnum('token_lookup_kind', ['page', 'archive']);
export const tokenLookupOutcome = pgEnum('token_lookup_outcome', [
  'success',
  'unknown_token',
  'expired',
  'revoked',
  'attempts_exhausted',
  'object_missing',
]);

// Every presentation of a Download token (spec §12.3): append-only, like the
// audit spine — the application role holds SELECT/INSERT only. `request_id`
// is nullable because an unknown token resolves to no Request; `token_prefix`
// is the presented token's first 8 characters, never the full token.
export const tokenLookup = pgTable(
  'token_lookup',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    downloadTokenId: uuid('download_token_id').references(
      () => downloadToken.id,
    ),
    requestId: uuid('request_id').references(() => request.id),
    tokenPrefix: text('token_prefix').notNull(),
    kind: tokenLookupKind('kind').notNull(),
    outcome: tokenLookupOutcome('outcome').notNull(),
    ip: inet('ip').notNull(),
    userAgent: text('user_agent').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('token_lookup_download_token_id_idx').on(t.downloadTokenId),
    index('token_lookup_ip_idx').on(t.ip),
  ],
);

// One IP's failure counter for the download-lookup throttle (spec §9.2):
// operational state, genuinely deletable, like `login_throttle` — but a flat
// 20/hour-then-1-hour-block counter, a different policy from login's
// exponential backoff, so it gets its own table rather than a shared shape.
export const downloadThrottle = pgTable('download_throttle', {
  ip: inet('ip').primaryKey(),
  failureCount: integer('failure_count').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
});

export const mailKind = pgEnum('mail_kind', MAIL_KINDS);
export const mailDeliveryStatus = pgEnum('mail_delivery_status', [
  'queued',
  'sent',
  'failed',
  'abandoned',
]);

// One row per logical email — one per Request per kind, so retries of the
// same email correlate under one row. This is what the `mail` health
// component (spec §11.3) reads: the closed event catalogue's
// `mail_send_failed`/`mail_send_abandoned` payloads carry no `kind`, so they
// cannot answer "is a queue notification currently failing" on their own.
export const mailDelivery = pgTable(
  'mail_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id),
    kind: mailKind('kind').notNull(),
    status: mailDeliveryStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('mail_delivery_request_id_idx').on(t.requestId),
    index('mail_delivery_status_idx').on(t.status),
  ],
);

// The tick's heartbeat (spec §15.3): one row, overwritten every pass, stale
// after 5 minutes. A single row rather than an append-only log, so liveness
// costs no growth and needs no pruning — the application role holds no DELETE
// here (grants: migration 0009).
export const schedulerHeartbeat = pgTable(
  'scheduler_heartbeat',
  {
    id: smallint('id').primaryKey().default(1),
    beatAt: timestamp('beat_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('scheduler_heartbeat_single_row', sql`${t.id} = 1`)],
);
