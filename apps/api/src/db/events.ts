// The closed event catalogue (spec §12.4). Adding a type here is a migration
// and a spec change — these arrays are the single source of truth for both the
// Postgres enums (schema.ts) and the TypeScript payload shapes below.
//
// `mail_bounced` does not exist and must never be added: bounces return to a
// mailbox this application does not own, and reading it was declined.

export const ACTOR_TYPES = ["requester", "reviewer", "system", "anonymous"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const REQUEST_EVENT_TYPES = [
  // Request lifecycle
  "submitted",
  "probe_performed",
  "probe_failed",
  "approved",
  "rejected",
  "note_amended",
  "expired",
  "contact_redacted",
  // Extraction lifecycle
  "job_queued",
  "job_deferred_low_disk",
  "job_started",
  "code_fetched",
  "job_completed",
  "job_failed",
  "extraction_alert_raised",
  "extraction_alert_cleared",
  "extraction_rerun_queued",
  // Delivery and collection
  "mail_sent",
  "mail_send_failed",
  "mail_send_abandoned",
  "delivery_alert_raised",
  "download_attempted",
  "collection_lapse_raised",
  "collection_lapse_cleared",
  "download_token_revoked",
  "download_token_reissued",
  "expired_uncollected",
  "object_deleted",
] as const;
export type RequestEventType = (typeof REQUEST_EVENT_TYPES)[number];

export const REVIEWER_EVENT_TYPES = [
  "login_succeeded",
  "login_failed",
  "logged_out",
  "session_expired",
  "password_changed",
  "seeded",
  "totp_enrolled",
  "deactivated",
] as const;
export type ReviewerEventType = (typeof REVIEWER_EVENT_TYPES)[number];

// --- Per-type request_event payload shapes (spec §12.4) --------------------

// ip/userAgent live on request_event's own columns for this actor kind
// (§12.2) — not duplicated in the payload, so there is only one place either
// could disagree with itself.
type SubmittedPayload = Record<string, never>;

interface ProbePerformedPayload {
  span: { start: string; end: string };
  codes: Array<{
    groupCode: string;
    calls: number;
    totalItems: number;
    xRequestId: string;
  }>;
  totalItems: number;
}

interface ProbeFailedPayload {
  groupCode: string;
  errors: Array<{ message: string; xRequestId: string | null }>;
}

interface Snapshot {
  diseaseGroupName: string;
  reportCodes: string[];
  startDate: string;
  endDate: string;
  area: { kind: "national" } | { kind: "province"; province: string } | { kind: "region"; region: number };
  probeRowCount: number | "pending" | "failed";
  workplace: string;
}

interface ApprovedPayload {
  snapshot: Snapshot;
}

interface RejectedPayload {
  snapshot: Snapshot;
  internalNote: string;
}

interface NoteAmendedPayload {
  citesEventId: number;
  note: string;
}

interface ExpiredPayload {
  notifiedAt: string;
  businessHoursElapsed: number;
  reviewerAccountsActive: number;
  decisionAttemptedAndRefused: boolean;
}

interface ContactRedactedPayload {
  operator: string;
}

interface JobQueuedPayload {
  requestId: string;
}

interface JobDeferredLowDiskPayload {
  freeBytes: number;
  floorBytes: number;
}

interface JobStartedPayload {
  attempt: number;
}

interface CodeFetchedPayload {
  groupCode: string;
  startDate: string;
  endDate: string;
  pageCount: number;
  xRequestId: string;
  rowsReceived: number;
  totalItems: number;
}

interface JobCompletedPayload {
  fingerprint: {
    rowCount: number;
    columnCount: number;
    csvBytes: number;
    zipBytes: number;
    csvSha256: string;
  };
  referenceData: {
    provincesChecksum: string;
    dataDictionaryChecksum: string;
  };
  archiveFilename: string;
  impossibleDerivationInputs: number;
  probeVsRunDrift: Array<{ groupCode: string; probeTotal: number | null; runTotal: number }>;
}

interface JobFailedPayload {
  cause: "upstream_5xx" | "auth_expiry" | "completeness_mismatch" | "stall" | "internal";
  xRequestId: string | null;
}

interface ExtractionAlertRaisedPayload {
  reason: string;
}

interface ExtractionAlertClearedPayload {
  outcome: "contacted_requester" | "abandoned" | "re_ran";
  assignedReviewerId: string;
  clearingReviewerId: string | null;
  rerunAttempts: number;
}

interface ExtractionRerunQueuedPayload {
  originalDecisionEventId: number;
}

interface MailSentPayload {
  kind: "delivery" | "queue_notification" | "rejection" | "extraction_failure";
  to: string;
  relayResponse: string;
}

interface MailSendFailedPayload {
  tryNumber: number;
  relayError: string;
}

interface MailSendAbandonedPayload {
  tryNumber: number;
}

interface DeliveryAlertRaisedPayload {
  reason: "send_abandoned";
}

// ip/userAgent live on request_event's own columns for this actor kind
// (§12.2) — not duplicated here.
interface DownloadAttemptedPayload {
  tokenPrefix: string;
  outcome: string;
}

interface CollectionLapseRaisedPayload {
  wallClockHoursElapsed: number;
}

interface CollectionLapseClearedPayload {
  outcome: "collected_late" | "contacted_requester" | "abandoned" | "re_ran";
  assignedReviewerId: string;
  clearingReviewerId: string | null;
}

interface DownloadTokenRevokedPayload {
  reason: "resend" | "rerun_ready";
  supersededByRunId: string | null;
}

interface DownloadTokenReissuedPayload {
  previousAddress: string;
  correctedAddress: string;
}

interface ExpiredUncollectedPayload {
  expiredAt: string;
}

interface ObjectDeletedPayload {
  actor: ActorType;
  objectKey: string;
  outcome: "deleted" | "already_absent" | "failed";
}

export type RequestEventPayload =
  | { type: "submitted"; payload: SubmittedPayload }
  | { type: "probe_performed"; payload: ProbePerformedPayload }
  | { type: "probe_failed"; payload: ProbeFailedPayload }
  | { type: "approved"; payload: ApprovedPayload }
  | { type: "rejected"; payload: RejectedPayload }
  | { type: "note_amended"; payload: NoteAmendedPayload }
  | { type: "expired"; payload: ExpiredPayload }
  | { type: "contact_redacted"; payload: ContactRedactedPayload }
  | { type: "job_queued"; payload: JobQueuedPayload }
  | { type: "job_deferred_low_disk"; payload: JobDeferredLowDiskPayload }
  | { type: "job_started"; payload: JobStartedPayload }
  | { type: "code_fetched"; payload: CodeFetchedPayload }
  | { type: "job_completed"; payload: JobCompletedPayload }
  | { type: "job_failed"; payload: JobFailedPayload }
  | { type: "extraction_alert_raised"; payload: ExtractionAlertRaisedPayload }
  | { type: "extraction_alert_cleared"; payload: ExtractionAlertClearedPayload }
  | { type: "extraction_rerun_queued"; payload: ExtractionRerunQueuedPayload }
  | { type: "mail_sent"; payload: MailSentPayload }
  | { type: "mail_send_failed"; payload: MailSendFailedPayload }
  | { type: "mail_send_abandoned"; payload: MailSendAbandonedPayload }
  | { type: "delivery_alert_raised"; payload: DeliveryAlertRaisedPayload }
  | { type: "download_attempted"; payload: DownloadAttemptedPayload }
  | { type: "collection_lapse_raised"; payload: CollectionLapseRaisedPayload }
  | { type: "collection_lapse_cleared"; payload: CollectionLapseClearedPayload }
  | { type: "download_token_revoked"; payload: DownloadTokenRevokedPayload }
  | { type: "download_token_reissued"; payload: DownloadTokenReissuedPayload }
  | { type: "expired_uncollected"; payload: ExpiredUncollectedPayload }
  | { type: "object_deleted"; payload: ObjectDeletedPayload };

// --- Per-type reviewer_event payload shapes (spec §12.4) -------------------
// ip/userAgent live on reviewer_event's own columns — not duplicated below.

type LoginSucceededPayload = Record<string, never>;

interface LoginFailedPayload {
  factor: "password" | "totp";
  totpClockDrift: boolean;
}

type LoggedOutPayload = Record<string, never>;

interface SessionExpiredPayload {
  reason: "idle_timeout" | "absolute_ceiling";
}

type PasswordChangedPayload = Record<string, never>;

interface SeededPayload {
  operator: string;
}

type TotpEnrolledPayload = Record<string, never>;

interface DeactivatedPayload {
  operator: string;
  force: boolean;
}

export type ReviewerEventPayload =
  | { type: "login_succeeded"; payload: LoginSucceededPayload }
  | { type: "login_failed"; payload: LoginFailedPayload }
  | { type: "logged_out"; payload: LoggedOutPayload }
  | { type: "session_expired"; payload: SessionExpiredPayload }
  | { type: "password_changed"; payload: PasswordChangedPayload }
  | { type: "seeded"; payload: SeededPayload }
  | { type: "totp_enrolled"; payload: TotpEnrolledPayload }
  | { type: "deactivated"; payload: DeactivatedPayload };
