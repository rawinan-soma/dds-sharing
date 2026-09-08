import {
  UpstreamAuthError,
  UpstreamClientError,
  UpstreamGatewayTimeoutError,
  UpstreamMalformedResponseError,
  UpstreamMetaMismatchError,
  UpstreamPageTooLargeError,
  UpstreamRangeError,
  UpstreamRetriesExhaustedError,
  UpstreamServerError,
  UpstreamTimeoutError,
  UpstreamTotalItemsShiftedError,
  UpstreamValidationError,
} from "./upstream-client-errors.js";
import {
  NOOP_UPSTREAM_LOGGER,
  type FetchDiseaseGroupParams,
  type FetchDiseaseGroupResult,
  type UpstreamCallRecord,
  type UpstreamEnvelope,
  type UpstreamErrorBody,
  type UpstreamLogger,
  type UpstreamRow,
} from "./upstream-client.types.js";

export const DEFAULT_PAGE_SIZE = 10_000;
export const MIN_PAGE_SIZE = 20;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;

const DISEASE_GROUPS_PATH = "/api/d506/v1/disease-groups";

/**
 * Concurrency buys nothing here: eight concurrent calls all returned 200 but
 * degraded from ~3.9s to ~14.3s each, because upstream serializes requests
 * regardless (§5.3, §7.7). Do not raise this expecting throughput — there is
 * none to gain, only latency to lose.
 */
export const UPSTREAM_CONCURRENCY = 1;

export interface UpstreamClientOptions {
  baseUrl: string;
  /** One bearer token for the whole service. */
  token: string;
  logger?: UpstreamLogger;
  /** Per-request timeout, matching the gateway's own 60s (§7.6). */
  timeoutMs?: number;
  /** Attempts for a whole code-level fetch — never per page (§7.6: no mid-code resume). */
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

interface PageResult {
  envelope: UpstreamEnvelope<UpstreamRow>;
  requestId?: string;
  processTimeMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * §5.5's taxonomy names three 422 causes (page_size out of bounds, a
 * malformed date, end_date < start_date) but upstream gives no field or code
 * to tell them apart — only prose in `message`. The ticket's own taxonomy
 * groups all three under one 422 outcome (unlike 400, which it splits in
 * two), so they collapse to a single `UpstreamValidationError` here: any
 * 422 means the client sent something upstream won't accept, and the fix is
 * the same regardless of which field it was.
 *
 * 400 is genuinely two distinct outcomes (range vs. page-too-large), and
 * `message` is the only signal available to distinguish them — a fragility
 * inherited from upstream, not introduced here.
 */
function classifyErrorStatus(
  status: number,
  body: UpstreamErrorBody | undefined,
): UpstreamClientError {
  const message = body?.message?.toLowerCase() ?? "";

  if (status === 401) return new UpstreamAuthError();
  if (status === 422) return new UpstreamValidationError();
  if (status === 400) {
    return message.includes("page")
      ? new UpstreamPageTooLargeError()
      : new UpstreamRangeError();
  }
  if (status === 504) return new UpstreamGatewayTimeoutError();
  return new UpstreamServerError(status);
}

/**
 * The upstream boundary: `GET` against DDC's disease-groups endpoint, with
 * the retry, pagination and completeness-guard discipline §5–§7 require.
 *
 * Sends only the five known-good parameter names (§5.2 — an unknown name is
 * silently ignored, not rejected) and never logs a response body, on any
 * path, error or otherwise (§14.5).
 */
export class UpstreamClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly logger: UpstreamLogger;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: UpstreamClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.logger = options.logger ?? NOOP_UPSTREAM_LOGGER;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Fetches every row for one Report code over one half-open span — one call
   * per page, walked in order, with the code as the atomic retry unit (§7.6).
   */
  async fetchDiseaseGroup(
    params: FetchDiseaseGroupParams,
  ): Promise<FetchDiseaseGroupResult> {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    if (pageSize < MIN_PAGE_SIZE) {
      throw new RangeError(
        `page_size must never be below ${MIN_PAGE_SIZE}, got ${pageSize}`,
      );
    }

    let lastRetryableError: UpstreamClientError | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.walkPages({ ...params, pageSize });
      } catch (error) {
        if (!(error instanceof UpstreamClientError) || !error.retryable) {
          throw error;
        }
        lastRetryableError = error;
        if (attempt < this.maxAttempts) {
          await sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    throw new UpstreamRetriesExhaustedError(lastRetryableError!);
  }

  /** One attempt: walks page 1..N from scratch. No mid-code resume (§7.6). */
  private async walkPages(
    params: Required<
      Pick<
        FetchDiseaseGroupParams,
        "groupCode" | "startDate" | "endDate" | "pageSize"
      >
    >,
  ): Promise<FetchDiseaseGroupResult> {
    const rows: UpstreamRow[] = [];
    const calls: UpstreamCallRecord[] = [];
    let page = 1;
    let totalItems: number | undefined;

    for (;;) {
      const { envelope, requestId, processTimeMs } = await this.getPage(
        params,
        page,
      );
      calls.push({ requestId, processTimeMs });

      this.logger.logCall({
        status: 200,
        groupCode: params.groupCode,
        page,
        totalItems: envelope.meta.total_items,
        requestId,
        processTimeMs,
      });

      if (
        envelope.meta.page !== page ||
        envelope.meta.page_size !== params.pageSize
      ) {
        this.logError(params.groupCode, page, 200, "meta_mismatch");
        throw new UpstreamMetaMismatchError();
      }

      if (totalItems === undefined) {
        totalItems = envelope.meta.total_items;
      } else if (envelope.meta.total_items !== totalItems) {
        this.logError(params.groupCode, page, 200, "total_items_shifted");
        throw new UpstreamTotalItemsShiftedError();
      }

      rows.push(...envelope.data);

      if (!envelope.meta.has_next || page >= envelope.meta.total_pages) break;
      page += 1;
    }

    return { rows, totalItems: totalItems ?? 0, calls };
  }

  /** Never passes a response body through (§14.5) — only these structured fields. */
  private logError(
    groupCode: number,
    page: number,
    status: number,
    errorKind: string,
    extra?: { requestId?: string; processTimeMs?: number },
  ): void {
    this.logger.logError({ status, groupCode, page, errorKind, ...extra });
  }

  private async getPage(
    params: {
      groupCode: number;
      startDate: string;
      endDate: string;
      pageSize: number;
    },
    page: number,
  ): Promise<PageResult> {
    const url = new URL(DISEASE_GROUPS_PATH, this.baseUrl);
    url.searchParams.set("group_code", String(params.groupCode));
    url.searchParams.set("start_date", params.startDate);
    url.searchParams.set("end_date", params.endDate);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(params.pageSize));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        this.logError(params.groupCode, page, 0, "client_timeout");
        throw new UpstreamTimeoutError();
      }
      this.logError(params.groupCode, page, 0, "malformed_response");
      throw new UpstreamMalformedResponseError(error);
    }
    clearTimeout(timer);

    const requestId = response.headers.get("x-request-id") ?? undefined;
    const processTimeMsHeader = response.headers.get("x-process-time-ms");
    const processTimeMs = processTimeMsHeader
      ? Number(processTimeMsHeader)
      : undefined;

    if (!response.ok) {
      let body: UpstreamErrorBody | undefined;
      try {
        body = (await response.json()) as UpstreamErrorBody;
      } catch {
        body = undefined;
      }
      const error = classifyErrorStatus(response.status, body);
      this.logError(params.groupCode, page, response.status, error.kind, {
        requestId,
        processTimeMs,
      });
      throw error;
    }

    let envelope: UpstreamEnvelope<UpstreamRow>;
    try {
      envelope = (await response.json()) as UpstreamEnvelope<UpstreamRow>;
      if (
        !envelope ||
        typeof envelope.meta !== "object" ||
        envelope.meta === null
      ) {
        throw new Error("response body has no meta");
      }
    } catch (error) {
      this.logError(
        params.groupCode,
        page,
        response.status,
        "malformed_response",
        { requestId, processTimeMs },
      );
      throw new UpstreamMalformedResponseError(error);
    }

    return { envelope, requestId, processTimeMs };
  }
}
