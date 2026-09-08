/**
 * The distinct handled outcomes of §5.5's failure taxonomy, plus the client's
 * own structural checks. `retryable` decides whether the code-level retry
 * loop (§7.6) spends one of its 3 attempts recovering, or fails immediately.
 *
 * Deliberately never carries the upstream response body (§14.5) — only a
 * `message` the client itself composed.
 */
export abstract class UpstreamClientError extends Error {
  abstract readonly kind: string;
  abstract readonly retryable: boolean;
}

/** 401 — bad token. Never retried: DDC revoking the token is what no retry recovers from. */
export class UpstreamAuthError extends UpstreamClientError {
  readonly kind = "auth_error";
  readonly retryable = false;
  constructor() {
    super("upstream rejected the bearer token");
  }
}

/** 422 — page_size out of bounds or a malformed date. A client bug; retrying sends the same request. */
export class UpstreamValidationError extends UpstreamClientError {
  readonly kind = "validation_error";
  readonly retryable = false;
  constructor() {
    super("upstream rejected the request as invalid");
  }
}

/** 400 — end_date < start_date, or a span exceeding 365 days. */
export class UpstreamRangeError extends UpstreamClientError {
  readonly kind = "range_error";
  readonly retryable = false;
  constructor() {
    super("upstream rejected the date range");
  }
}

/** 400 — page far beyond total_pages. */
export class UpstreamPageTooLargeError extends UpstreamClientError {
  readonly kind = "page_too_large";
  readonly retryable = false;
  constructor() {
    super("upstream rejected the page as too large");
  }
}

/** 504 — the gateway's own 60s timeout. Retryable: this is the expected shape of upstream load. */
export class UpstreamGatewayTimeoutError extends UpstreamClientError {
  readonly kind = "gateway_timeout";
  readonly retryable = true;
  constructor() {
    super("upstream gateway timed out");
  }
}

/** Any other 5xx. Retryable. */
export class UpstreamServerError extends UpstreamClientError {
  readonly kind = "server_error";
  readonly retryable = true;
  constructor(readonly status: number) {
    super(`upstream returned ${status}`);
  }
}

/** The client's own per-request timeout (60s, matching the gateway) fired before a response arrived. */
export class UpstreamTimeoutError extends UpstreamClientError {
  readonly kind = "client_timeout";
  readonly retryable = true;
  constructor() {
    super("upstream call timed out client-side");
  }
}

/** A network failure, or a response body that could not be parsed (the truncated-page shape). */
export class UpstreamMalformedResponseError extends UpstreamClientError {
  readonly kind = "malformed_response";
  readonly retryable = true;
  constructor(cause?: unknown) {
    super("upstream response could not be read");
    this.cause = cause;
  }
}

/**
 * `meta` did not echo the `page`/`page_size` that was sent (§5.2). Not
 * retried: an identical request would get the same wrong echo.
 */
export class UpstreamMetaMismatchError extends UpstreamClientError {
  readonly kind = "meta_mismatch";
  readonly retryable = false;
  constructor() {
    super("upstream's meta did not echo the requested page/page_size");
  }
}

/**
 * §7.6: `total_items` disagreed with an earlier page of the same attempt.
 * Retryable — it is exactly what discards and restarts the code from page 1.
 */
export class UpstreamTotalItemsShiftedError extends UpstreamClientError {
  readonly kind = "total_items_shifted";
  readonly retryable = true;
  constructor() {
    super("upstream's total_items shifted mid-walk");
  }
}

/** A code-level fetch exhausted its 3 attempts. Wraps the last retryable error. */
export class UpstreamRetriesExhaustedError extends UpstreamClientError {
  readonly kind = "retries_exhausted";
  readonly retryable = false;
  constructor(readonly lastError: UpstreamClientError) {
    super(`upstream call failed after 3 attempts: ${lastError.kind}`);
    this.cause = lastError;
  }
}
