/**
 * What went wrong talking to upstream, as one handled outcome per cause.
 *
 * The documented failure taxonomy (spec §5.5) maps one-to-one onto the first
 * five kinds; the rest are the failures that have no status code.
 */
export type UpstreamErrorKind =
  | 'token_invalid' // 401 — DDC revoked or expired the token; no retry recovers
  | 'validation_error' // 422 — page_size out of bounds, malformed or reversed dates
  | 'range_too_wide' // 400 — span over 365 days
  | 'page_too_large' // 400 — page far beyond total_pages
  | 'gateway_timeout' // 504 — upstream's own 60 s cut-off
  | 'server_error' // any other 5xx
  | 'bad_request' // any other 400
  | 'unexpected_status' // any other non-2xx
  | 'timeout' // our 60 s per-request timeout
  | 'network' // no response at all
  | 'malformed_response' // a body that is cut off, or is not the envelope
  | 'meta_mismatch'; // meta did not echo what was asked

/** Only these are worth another attempt; the rest would fail identically. */
export const RETRYABLE_KINDS: ReadonlySet<UpstreamErrorKind> = new Set([
  'gateway_timeout',
  'server_error',
  'timeout',
  'network',
  'malformed_response',
]);

export interface UpstreamErrorDetails {
  kind: UpstreamErrorKind;
  status?: number;
  groupCode: string;
  page: number;
  attempts: number;
  requestId?: string | null;
  processTimeMs?: number | null;
  /** Names of the parameters upstream faulted, from `errors[].field`. */
  fields?: string[];
}

/**
 * Deliberately carries no response body, no upstream message, and no `cause`.
 * A body can be case data, and a truncated body is still case data; V8's own
 * JSON.parse errors quote a slice of the text they choke on. So the message is
 * built here, from the kind, and nothing caught is ever chained (spec §14.5).
 */
export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status?: number;
  readonly groupCode: string;
  readonly page: number;
  readonly attempts: number;
  /** Quote this to DDC support: the one field with no substitute. */
  readonly requestId: string | null;
  readonly processTimeMs: number | null;
  readonly fields: string[];

  constructor(details: UpstreamErrorDetails) {
    super(
      `Upstream ${details.kind}` +
        (details.status ? ` (status ${details.status})` : '') +
        ` for code ${details.groupCode} page ${details.page}`,
    );
    this.name = 'UpstreamError';
    this.kind = details.kind;
    this.status = details.status;
    this.groupCode = details.groupCode;
    this.page = details.page;
    this.attempts = details.attempts;
    this.requestId = details.requestId ?? null;
    this.processTimeMs = details.processTimeMs ?? null;
    this.fields = details.fields ?? [];
  }
}
