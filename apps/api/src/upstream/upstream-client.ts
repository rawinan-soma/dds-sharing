import { Logger, LoggerService } from '@nestjs/common';
import type { Span } from './span-builder';
import {
  RETRYABLE_KINDS,
  UpstreamError,
  UpstreamErrorKind,
} from './upstream-error';
import {
  FETCH_PAGE_SIZE,
  KNOWN_PARAMS,
  KnownParam,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  PROBE_PAGE_SIZE,
  UPSTREAM_DEFAULTS,
} from './upstream.config';

export interface UpstreamClientOptions {
  baseUrl: string;
  /** One bearer token for the whole service. */
  token: string;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  /** Injectable so specs do not wait out a real backoff. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PageQuery {
  groupCode: string;
  span: Span;
  /** A 1-based index, not a count. `page=0` is a 422. */
  page: number;
  pageSize: number;
}

export interface UpstreamMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface UpstreamPage {
  /** Raw upstream rows, plaintext identifiers included. Memory only, always. */
  rows: Record<string, unknown>[];
  meta: UpstreamMeta;
  requestId: string | null;
  processTimeMs: number | null;
}

/**
 * One response, for the audit record. Emitted for every response — failures
 * too — because `x-request-id` is what DDC support needs and a failed call is
 * exactly when it is asked for. Carries no body, by construction.
 */
export interface ResponseInfo {
  groupCode: string;
  page: number;
  attempt: number;
  status: number;
  requestId: string | null;
  processTimeMs: number | null;
  totalItems: number | null;
}

export type OnResponse = (info: ResponseInfo) => void;

interface Envelope {
  data: Record<string, unknown>[];
  meta: UpstreamMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEnvelope(json: unknown): Envelope | null {
  if (!isRecord(json) || json.status !== true || !Array.isArray(json.data)) {
    return null;
  }
  const meta = json.meta;
  if (
    !isRecord(meta) ||
    typeof meta.page !== 'number' ||
    typeof meta.page_size !== 'number' ||
    typeof meta.total_items !== 'number' ||
    typeof meta.total_pages !== 'number' ||
    typeof meta.has_next !== 'boolean' ||
    typeof meta.has_previous !== 'boolean'
  ) {
    return null;
  }
  return {
    data: json.data as Record<string, unknown>[],
    meta: {
      page: meta.page,
      pageSize: meta.page_size,
      totalItems: meta.total_items,
      totalPages: meta.total_pages,
      hasNext: meta.has_next,
      hasPrevious: meta.has_previous,
    },
  };
}

/** Maps a non-2xx answer onto one handled outcome. Reads the body only to sort it. */
function classify(
  status: number,
  body: unknown,
): { kind: UpstreamErrorKind; fields: string[] } {
  const message =
    isRecord(body) && typeof body.message === 'string' ? body.message : '';
  // Only names we ourselves send survive: a field name is never case data, but
  // nothing else from the body is allowed through either.
  const fields =
    isRecord(body) && Array.isArray(body.errors)
      ? body.errors
          .map((e) => (isRecord(e) ? e.field : undefined))
          .filter((f): f is KnownParam =>
            (KNOWN_PARAMS as readonly unknown[]).includes(f),
          )
      : [];

  switch (status) {
    case 401:
      return { kind: 'token_invalid', fields };
    case 422:
      return { kind: 'validation_error', fields };
    case 400:
      if (/date range must not exceed/i.test(message)) {
        return { kind: 'range_too_wide', fields };
      }
      if (/page too large/i.test(message)) {
        return { kind: 'page_too_large', fields };
      }
      return { kind: 'bad_request', fields };
    case 504:
      return { kind: 'gateway_timeout', fields };
    default:
      return {
        kind: status >= 500 ? 'server_error' : 'unexpected_status',
        fields,
      };
  }
}

export class UpstreamClient {
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly options: UpstreamClientOptions,
    private readonly logger: LoggerService = new Logger(UpstreamClient.name),
  ) {
    this.timeoutMs = options.timeoutMs ?? UPSTREAM_DEFAULTS.timeoutMs;
    this.maxAttempts = options.maxAttempts ?? UPSTREAM_DEFAULTS.maxAttempts;
    this.backoffBaseMs =
      options.backoffBaseMs ?? UPSTREAM_DEFAULTS.backoffBaseMs;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Walks one Report code over the span at `page_size=10000`, one page at a
   * time, so the caller can project and append each page before the next is
   * fetched (spec §7.1). `while page <= meta.total_pages`, ending on
   * `meta.has_next === false`.
   *
   * Each page is retried on its own. Restarting a whole code from page 1, and
   * comparing `total_items` across attempts, is the extraction job's business:
   * every page carries `meta.totalItems` so it can.
   */
  async *pages(
    groupCode: string,
    span: Span,
    onResponse?: OnResponse,
  ): AsyncGenerator<UpstreamPage> {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const result = await this.fetchPage(
        { groupCode, span, page, pageSize: FETCH_PAGE_SIZE },
        onResponse,
      );
      yield result;
      if (!result.meta.hasNext) return;
      totalPages = result.meta.totalPages;
      page += 1;
    }
    // has_next was true on what upstream itself called the last page.
    throw new UpstreamError({
      kind: 'malformed_response',
      groupCode,
      page,
      attempts: 1,
    });
  }

  /** The Probe's one call: `page_size=20`, page 1, read `meta.totalItems`. */
  probe(
    groupCode: string,
    span: Span,
    onResponse?: OnResponse,
  ): Promise<UpstreamPage> {
    return this.fetchPage(
      { groupCode, span, page: 1, pageSize: PROBE_PAGE_SIZE },
      onResponse,
    );
  }

  /** One request, retried: 3 attempts, exponential backoff, 60 s each. */
  async fetchPage(
    query: PageQuery,
    onResponse?: OnResponse,
  ): Promise<UpstreamPage> {
    this.assertSendable(query);

    let lastError: UpstreamError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.attempt(query, attempt, onResponse);
      } catch (error) {
        if (!(error instanceof UpstreamError)) throw error;
        lastError = error;
        if (!RETRYABLE_KINDS.has(error.kind) || attempt === this.maxAttempts) {
          break;
        }
        await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1));
      }
    }
    throw lastError!;
  }

  private assertSendable({ page, pageSize }: PageQuery): void {
    if (
      !Number.isInteger(pageSize) ||
      pageSize < MIN_PAGE_SIZE ||
      pageSize > MAX_PAGE_SIZE
    ) {
      throw new RangeError(
        `page_size must be an integer from ${MIN_PAGE_SIZE} to ${MAX_PAGE_SIZE}`,
      );
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new RangeError('page is a 1-based index');
    }
  }

  private buildUrl({ groupCode, span, page, pageSize }: PageQuery): URL {
    const params: Record<KnownParam, string> = {
      group_code: groupCode,
      // The span is sent verbatim. The exclusive `end_date` was made by the span
      // builder, and no arithmetic on it belongs here.
      start_date: span.startDate,
      end_date: span.endDate,
      page: String(page),
      page_size: String(pageSize),
    };
    const url = new URL(`${this.options.baseUrl}/disease-groups`);
    for (const name of KNOWN_PARAMS) url.searchParams.set(name, params[name]);
    return url;
  }

  private async attempt(
    query: PageQuery,
    attempt: number,
    onResponse?: OnResponse,
  ): Promise<UpstreamPage> {
    const { groupCode, page, pageSize } = query;
    const signal = AbortSignal.timeout(this.timeoutMs);
    const fail = (
      kind: UpstreamErrorKind,
      extra: Partial<ConstructorParameters<typeof UpstreamError>[0]> = {},
    ) => {
      const error = new UpstreamError({
        kind,
        groupCode,
        page,
        attempts: attempt,
        ...extra,
      });
      this.logger.warn(
        `upstream failure kind=${kind}` +
          (error.status ? ` status=${error.status}` : '') +
          ` code=${groupCode} page=${page} attempt=${attempt}` +
          (error.requestId ? ` request_id=${error.requestId}` : ''),
      );
      return error;
    };

    let response: Response;
    try {
      response = await fetch(this.buildUrl(query), {
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          Accept: 'application/json',
        },
        signal,
      });
    } catch {
      // Nothing caught is chained or logged: it can quote what it choked on.
      throw fail(signal.aborted ? 'timeout' : 'network');
    }

    const requestId = response.headers.get('x-request-id');
    const processTime = Number(response.headers.get('x-process-time-ms'));
    const processTimeMs =
      response.headers.has('x-process-time-ms') && Number.isFinite(processTime)
        ? processTime
        : null;
    const context = { status: response.status, requestId, processTimeMs };

    let json: unknown;
    let readable = true;
    try {
      json = JSON.parse(await response.text());
    } catch {
      readable = false;
      if (signal.aborted) {
        this.report(onResponse, { ...context, groupCode, page, attempt });
        throw fail('timeout', context);
      }
    }

    const envelope = response.ok && readable ? parseEnvelope(json) : null;
    this.report(onResponse, {
      ...context,
      groupCode,
      page,
      attempt,
      totalItems: envelope?.meta.totalItems,
    });

    if (!response.ok) {
      const { kind, fields } = classify(
        response.status,
        readable ? json : null,
      );
      throw fail(kind, { ...context, fields });
    }
    if (!envelope) throw fail('malformed_response', context);
    if (envelope.meta.page !== page || envelope.meta.pageSize !== pageSize) {
      throw fail('meta_mismatch', context);
    }

    this.logger.log(
      `upstream response status=${response.status} code=${groupCode}` +
        ` page=${page} attempt=${attempt} total_items=${envelope.meta.totalItems}` +
        (requestId ? ` request_id=${requestId}` : ''),
    );
    return {
      rows: envelope.data,
      meta: envelope.meta,
      requestId,
      processTimeMs,
    };
  }

  private report(
    onResponse: OnResponse | undefined,
    info: Omit<ResponseInfo, 'totalItems'> & { totalItems?: number },
  ): void {
    onResponse?.({ ...info, totalItems: info.totalItems ?? null });
  }
}
