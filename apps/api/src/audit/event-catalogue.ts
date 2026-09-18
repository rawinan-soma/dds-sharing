// The closed event catalogue of spec §12.4.
//
// Adding a type is a migration AND a spec change, on purpose: an open-ended
// type-plus-payload column is how a third body of personal data gets created by
// accident. Later tickets write events; they do not add types.
//
// `mail_bounced` and `contact_redacted` are absent by decision, not omission:
// bounces return to a mailbox this application does not own, and Redaction was
// removed (ADR 0019). A type that can never be written is a lie in the schema.

export const ACTOR_TYPES = [
  'requester',
  'reviewer',
  'system',
  'anonymous',
] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// The kinds with no authenticated identity. Only these carry an IP and user
// agent; only `reviewer` carries a reviewer id (spec §12.2).
export const UNAUTHENTICATED_ACTOR_TYPES = ['requester', 'anonymous'] as const;

export const REQUEST_EVENT_TYPES = [
  // Request lifecycle
  'submitted',
  'probe_performed',
  'probe_failed',
  'approved',
  'rejected',
  'note_amended',
  'expired',
  // Extraction lifecycle
  'job_queued',
  'job_deferred_low_disk',
  'job_started',
  'code_fetched',
  'job_completed',
  'job_failed',
  'extraction_alert_raised',
  'extraction_alert_cleared',
  'extraction_rerun_queued',
  // Delivery and collection
  'mail_sent',
  'mail_send_failed',
  'mail_send_abandoned',
  'delivery_alert_raised',
  'download_attempted',
  'collection_lapse_raised',
  'collection_lapse_cleared',
  'download_token_revoked',
  'expired_uncollected',
  'object_deleted',
] as const;
export type RequestEventType = (typeof REQUEST_EVENT_TYPES)[number];

// What a Reviewer did that belongs to no Request. Nothing about Requests is
// ever added here: clearing an Alert is a `request_event` with a `reviewer`
// actor.
export const REVIEWER_EVENT_TYPES = [
  'login_succeeded',
  'login_failed',
  'logged_out',
  'session_expired',
  'password_changed',
  'seeded',
  'totp_enrolled',
  'deactivated',
] as const;
export type ReviewerEventType = (typeof REVIEWER_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export type Actor<A extends ActorType = ActorType> = {
  requester: { actorType: 'requester'; ip: string; userAgent: string };
  anonymous: { actorType: 'anonymous'; ip: string; userAgent: string };
  reviewer: { actorType: 'reviewer'; reviewerId: string };
  system: { actorType: 'system' };
}[A];

// ---------------------------------------------------------------------------
// Payload shapes (jsonb). One documented shape per type.
// ---------------------------------------------------------------------------

/** A Report code's upstream errors, relayed verbatim with their request ids. */
export interface UpstreamError {
  message: string;
  xRequestId: string | null;
}

/** What the Reviewer had on screen; copied at the Decision (spec §12.3). */
export interface Snapshot {
  diseaseGroupName: string;
  reportCodes: string[];
  /** Inclusive human dates, `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  provinces: string[];
  /** May still be `pending` or `failed`: approve does not wait on the Probe. */
  probeRowCount: number | 'pending' | 'failed';
  workplace: string;
}

export interface CodeFetchDetail {
  groupCode: string;
  /** Half-open range. */
  startDate: string;
  endDate: string;
  pageCount: number;
  xRequestId: string | null;
}

export type JobFailureCause =
  | 'upstream_5xx'
  | 'auth_expiry'
  | 'completeness_mismatch'
  | 'stall'
  | 'internal';

export type MailKind =
  'delivery' | 'queue_notification' | 'rejection' | 'extraction_failure';

interface PerCodeTotals {
  [groupCode: string]: number;
}

export interface RequestEventPayloads {
  submitted: Record<string, never>;
  probe_performed: {
    reportCodes: string[];
    callsMade: number;
    spanStart: string;
    spanEnd: string;
    totalItemsByCode: PerCodeTotals;
    totalItems: number;
    xRequestIds: string[];
  };
  probe_failed: {
    groupCode: string;
    errors: UpstreamError[];
  };
  approved: { snapshot: Snapshot };
  rejected: { snapshot: Snapshot; internalNote: string };
  note_amended: { amendsEventId: number; internalNote: string };
  expired: {
    notifiedAt: string;
    businessHoursElapsed: number;
    reviewerAccountsActive: number;
    decisionAttemptedAndRefused: boolean;
  };
  job_queued: Record<string, never>;
  job_deferred_low_disk: { freeBytes: number; floorBytes: number };
  job_started: Record<string, never>;
  code_fetched: CodeFetchDetail & {
    rowsReceived: number;
    totalItems: number;
  };
  job_completed: {
    // Extract fingerprint: what was released.
    rowCount: number;
    columnCount: number;
    csvBytes: number;
    zipBytes: number;
    csvSha256: string;
    // Reference data: what made it.
    provincesChecksum: string;
    dataDictionaryChecksum: string;
    archiveFilename: string;
    impossibleDerivationInputs: number;
    /** Probe's per-code totals against the run's. Recorded, never asserted. */
    drift: { probe: PerCodeTotals; run: PerCodeTotals };
  };
  job_failed: {
    cause: JobFailureCause;
    xRequestId: string | null;
  };
  extraction_alert_raised: Record<string, never>;
  extraction_alert_cleared: {
    outcome: 'contacted_requester' | 'abandoned' | 're_ran';
    assignedReviewerId: string | null;
    clearingReviewerId: string | null;
    rerunAttempts: number;
  };
  extraction_rerun_queued: { originalDecisionEventId: number };
  mail_sent: { kind: MailKind; to: string; relayResponse: string };
  mail_send_failed: { tryNumber: number; relayError: string };
  mail_send_abandoned: Record<string, never>;
  delivery_alert_raised: Record<string, never>;
  /** Mirrored from `token_lookup`. Token prefix only, never the full token. */
  download_attempted: { tokenPrefix: string; outcome: string };
  collection_lapse_raised: { wallClockHoursElapsed: number };
  /** `system` = collected late. A `reviewer` carries the spec's closed
   *  three-value outcome, which §12.4 does not yet name; the ticket that writes
   *  this event narrows `outcome` to it. */
  collection_lapse_cleared: {
    outcome: string | null;
    assignedReviewerId: string | null;
    clearingReviewerId: string | null;
  };
  download_token_revoked: { supersededByEventId: number };
  expired_uncollected: Record<string, never>;
  object_deleted: { objectKey: string; outcome: string };
}

export interface ReviewerEventPayloads {
  login_succeeded: Record<string, never>;
  /** Never the submitted password or TOTP code: the pattern is the signal. */
  login_failed: {
    username: string;
    /** Valid one or two TOTP steps ago: host clock drift, not an attack. */
    totpClockDrift: boolean;
  };
  logged_out: Record<string, never>;
  session_expired: Record<string, never>;
  password_changed: Record<string, never>;
  /** Host commands name no one (ADR 0020): what happened to the Reviewer. */
  seeded: { reviewerId: string; username: string };
  totp_enrolled: Record<string, never>;
  deactivated: { reviewerId: string; forcedBelowFloor: boolean };
}

// ---------------------------------------------------------------------------
// Discriminated unions: the type decides the actor kinds and the payload.
// ---------------------------------------------------------------------------

interface RequestEventActors {
  submitted: 'requester';
  probe_performed: 'system';
  probe_failed: 'system';
  approved: 'reviewer';
  rejected: 'reviewer';
  note_amended: 'reviewer';
  expired: 'system';
  job_queued: 'system';
  job_deferred_low_disk: 'system';
  job_started: 'system';
  code_fetched: 'system';
  job_completed: 'system';
  job_failed: 'system';
  extraction_alert_raised: 'system';
  extraction_alert_cleared: 'system' | 'reviewer';
  extraction_rerun_queued: 'reviewer';
  mail_sent: 'system';
  mail_send_failed: 'system';
  mail_send_abandoned: 'system';
  delivery_alert_raised: 'system';
  download_attempted: 'anonymous';
  collection_lapse_raised: 'system';
  collection_lapse_cleared: 'system' | 'reviewer';
  download_token_revoked: 'system';
  expired_uncollected: 'system';
  object_deleted: 'system';
}

interface ReviewerEventActors {
  login_succeeded: 'reviewer';
  login_failed: 'anonymous';
  logged_out: 'reviewer';
  session_expired: 'reviewer';
  password_changed: 'reviewer';
  seeded: 'system';
  totp_enrolled: 'reviewer';
  deactivated: 'system';
}

// Compile-time proof that each map lists exactly the catalogue: a type added to
// one and not the other stops the build.
type Exhaustive<Keys extends string, Map> = [Keys] extends [keyof Map]
  ? [keyof Map] extends [Keys]
    ? Map
    : never
  : never;

type AuditEvent<Payloads, Actors extends Record<keyof Payloads, ActorType>> = {
  [T in keyof Payloads & keyof Actors]: {
    type: T;
    /** When the predicate became true; the legally meaningful timestamp. */
    occurredAt: Date;
    actor: Actor<Actors[T]>;
    payload: Payloads[T];
  };
}[keyof Payloads & keyof Actors];

export type RequestEvent = { requestId: string } & AuditEvent<
  Exhaustive<RequestEventType, RequestEventPayloads>,
  Exhaustive<RequestEventType, RequestEventActors>
>;

export type ReviewerEvent = AuditEvent<
  Exhaustive<ReviewerEventType, ReviewerEventPayloads>,
  Exhaustive<ReviewerEventType, ReviewerEventActors>
>;
