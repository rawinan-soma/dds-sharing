export interface UpstreamMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface UpstreamEnvelope<Row> {
  status: boolean;
  message: string;
  data: Row[];
  meta: UpstreamMeta;
}

/** The `{status, message}` error-body shape. */
export interface UpstreamErrorBodyPlain {
  status: boolean;
  message: string;
}

/** The `{status, message, errors[]}` error-body shape. */
export interface UpstreamErrorBodyWithFields extends UpstreamErrorBodyPlain {
  errors: Array<{ field: string; message: string }>;
}

export type UpstreamErrorBody =
  UpstreamErrorBodyPlain | UpstreamErrorBodyWithFields;

/** An upstream case-level row. Untyped here — de-identification happens post-fetch, downstream. */
export type UpstreamRow = Record<string, unknown>;

export interface FetchDiseaseGroupParams {
  /** Upstream's `group_code` — a bare integer, sent as-is. */
  groupCode: number;
  /** Half-open span from the span builder — inclusive `start_date`. */
  startDate: string;
  /** Half-open span from the span builder — exclusive `end_date`. */
  endDate: string;
  /** Defaults to 10,000 (§5.3) — always the right choice for a fetch. Never below 20 (§5.2). */
  pageSize?: number;
}

/** One successful HTTP response's `x-request-id`/`x-process-time-ms` — for the audit record. */
export interface UpstreamCallRecord {
  requestId?: string;
  processTimeMs?: number;
}

export interface FetchDiseaseGroupResult {
  rows: UpstreamRow[];
  /** From the first page's `meta.total_items` — used for the completeness assert (§7.5). */
  totalItems: number;
  /** One entry per successful HTTP response received while fetching this code, in page order. */
  calls: UpstreamCallRecord[];
}

/** The Probe's one-page-only call (§5.4) — same span as a fetch, `page_size=20` and page 1 only. */
export interface ProbeDiseaseGroupParams {
  /** Upstream's `group_code` — a bare integer, sent as-is. */
  groupCode: number;
  /** Half-open span from the span builder — inclusive `start_date`. */
  startDate: string;
  /** Half-open span from the span builder — exclusive `end_date`. */
  endDate: string;
  /** Defaults to {@link MIN_PAGE_SIZE} (20) — the Probe never has a reason to ask for more. */
  pageSize?: number;
}

export interface ProbeDiseaseGroupResult {
  /** Page 1's `meta.total_items` — the whole point of the call (§5.4). */
  totalItems: number;
  /**
   * One entry per physical call this code's probe made, in attempt order —
   * failed retries' ids included, not just the eventual success's (§5.4,
   * §12.4: `probe_performed` carries "every `x-request-id`"). `null` where a
   * failed attempt never got a response to read one from.
   */
  requestIds: Array<string | null>;
  /** Every physical call this code's probe made, including failed retries before the eventual success — accountability (§5.4), not just the successful one. */
  callsMade: number;
}

/** One failed attempt of a Probe call — its classification and the response's `x-request-id`, when one arrived. Named so it appears once, not as an inline shape repeated across the error, the client, and `probe_failed`'s payload builder. */
export interface ProbeAttempt {
  errorKind: string;
  requestId?: string;
}

/**
 * Never logs a response body — only these fields (§14.5). An error carrying a
 * body is logged with the body removed, not truncated.
 */
export interface UpstreamCallLogFields {
  status: number;
  groupCode: number;
  page: number;
  totalItems?: number;
  requestId?: string;
  processTimeMs?: number;
}

export interface UpstreamLogger {
  logCall(fields: UpstreamCallLogFields): void;
  logError(fields: UpstreamCallLogFields & { errorKind: string }): void;
}

export const NOOP_UPSTREAM_LOGGER: UpstreamLogger = {
  logCall: () => {},
  logError: () => {},
};
