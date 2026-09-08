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

export interface FetchDiseaseGroupResult {
  rows: UpstreamRow[];
  /** From the first page's `meta.total_items` — used for the completeness assert (§7.5). */
  totalItems: number;
  /** One `x-request-id` per HTTP response received while fetching this code — for the audit record. */
  requestIds: string[];
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
