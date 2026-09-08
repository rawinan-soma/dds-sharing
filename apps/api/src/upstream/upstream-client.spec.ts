import { describe, it, expect, vi } from "vitest";
import { UpstreamClient, DEFAULT_PAGE_SIZE } from "./upstream-client.js";
import {
  UpstreamAuthError,
  UpstreamGatewayTimeoutError,
  UpstreamMetaMismatchError,
  UpstreamPageTooLargeError,
  UpstreamRangeError,
  UpstreamRetriesExhaustedError,
  UpstreamTimeoutError,
  UpstreamValidationError,
} from "./upstream-client-errors.js";
import type {
  UpstreamEnvelope,
  UpstreamLogger,
  UpstreamRow,
} from "./upstream-client.types.js";

function envelope(
  overrides: Partial<UpstreamEnvelope<UpstreamRow>["meta"]> & {
    data?: UpstreamRow[];
  } = {},
) {
  const { data = [], ...meta } = overrides;
  return {
    status: true,
    message: "OK",
    data,
    meta: {
      page: 1,
      page_size: DEFAULT_PAGE_SIZE,
      total_items: data.length,
      total_pages: 1,
      has_next: false,
      has_previous: false,
      ...meta,
    },
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function spyLogger(): UpstreamLogger & { calls: string[]; errors: string[] } {
  const calls: string[] = [];
  const errors: string[] = [];
  return {
    calls,
    errors,
    logCall: (fields) => calls.push(JSON.stringify(fields)),
    logError: (fields) => errors.push(JSON.stringify(fields)),
  };
}

const baseParams = {
  groupCode: 209,
  startDate: "2026-01-01",
  endDate: "2026-01-08",
};

describe("UpstreamClient.fetchDiseaseGroup", () => {
  it("sends only the five known-good parameter names, with a bearer token", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(envelope()));
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "secret-token",
      fetchFn,
    });

    await client.fetchDiseaseGroup(baseParams);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/d506/v1/disease-groups");
    expect([...url.searchParams.keys()].sort()).toEqual(
      ["end_date", "group_code", "page", "page_size", "start_date"].sort(),
    );
    expect(url.searchParams.get("group_code")).toBe("209");
    expect(url.searchParams.get("start_date")).toBe("2026-01-01");
    expect(url.searchParams.get("end_date")).toBe("2026-01-08");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("page_size")).toBe(String(DEFAULT_PAGE_SIZE));
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-token",
    );
  });

  it("defaults page_size to 10,000", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(envelope()));
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
    });

    await client.fetchDiseaseGroup(baseParams);

    const [url] = fetchFn.mock.calls[0] as [URL];
    expect(url.searchParams.get("page_size")).toBe("10000");
  });

  it("never emits a page_size below 20, and never calls fetch to do it", async () => {
    const fetchFn = vi.fn();
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
    });

    await expect(
      client.fetchDiseaseGroup({ ...baseParams, pageSize: 19 }),
    ).rejects.toThrow(RangeError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("walks pages until has_next is false, concatenating rows in order", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            data: [{ id: 1 }],
            page: 1,
            total_pages: 3,
            total_items: 3,
            has_next: true,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            data: [{ id: 2 }],
            page: 2,
            total_pages: 3,
            total_items: 3,
            has_next: true,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            data: [{ id: 3 }],
            page: 3,
            total_pages: 3,
            total_items: 3,
            has_next: false,
          }),
        ),
      );
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
    });

    const result = await client.fetchDiseaseGroup(baseParams);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(result.totalItems).toBe(3);
    const pages = fetchFn.mock.calls.map(([url]: [URL]) =>
      url.searchParams.get("page"),
    );
    expect(pages).toEqual(["1", "2", "3"]);
  });

  it("captures x-request-id and x-process-time-ms across every page", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(envelope({ has_next: true, total_pages: 2 }), {
          headers: { "x-request-id": "req-1", "x-process-time-ms": "3487" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(envelope({ page: 2, has_next: false, total_pages: 2 }), {
          headers: { "x-request-id": "req-2", "x-process-time-ms": "3499" },
        }),
      );
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
    });

    const result = await client.fetchDiseaseGroup(baseParams);

    expect(result.calls).toEqual([
      { requestId: "req-1", processTimeMs: 3487 },
      { requestId: "req-2", processTimeMs: 3499 },
    ]);
  });

  it("throws a distinct, non-retried error for a mismatched meta echo", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(envelope({ page: 2 })));
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
    });

    await expect(client.fetchDiseaseGroup(baseParams)).rejects.toBeInstanceOf(
      UpstreamMetaMismatchError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, { status: true, message: "Token invalid" }, UpstreamAuthError],
    [
      422,
      {
        status: true,
        message: "Validation Error",
        errors: [{ field: "page_size", message: "too small" }],
      },
      UpstreamValidationError,
    ],
    [
      400,
      { status: true, message: "Date range must not exceed 1 year (365 days)" },
      UpstreamRangeError,
    ],
    [
      400,
      { status: true, message: "Page too large" },
      UpstreamPageTooLargeError,
    ],
  ])(
    "maps status %i to a distinct, non-retried handled outcome",
    async (status, body, ErrorClass) => {
      const fetchFn = vi.fn(async () =>
        jsonResponse(body, { status: status as number }),
      );
      const client = new UpstreamClient({
        baseUrl: "https://upstream.example",
        token: "t",
        fetchFn,
      });

      await expect(client.fetchDiseaseGroup(baseParams)).rejects.toBeInstanceOf(
        ErrorClass,
      );
      expect(fetchFn).toHaveBeenCalledTimes(1);
    },
  );

  it("handles the {status, message} and {status, message, errors[]} shapes alike", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ status: true, message: "Token invalid" }, { status: 401 }),
    );
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
    });
    await expect(client.fetchDiseaseGroup(baseParams)).rejects.toBeInstanceOf(
      UpstreamAuthError,
    );
  });

  it("retries a 504 three times with exponential backoff, then throws exhausted", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        { status: false, message: "Gateway Timeout" },
        { status: 504 },
      ),
    );
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
      retryBaseDelayMs: 1,
    });

    const error = await client.fetchDiseaseGroup(baseParams).catch((e) => e);

    expect(error).toBeInstanceOf(UpstreamRetriesExhaustedError);
    expect((error as UpstreamRetriesExhaustedError).lastError).toBeInstanceOf(
      UpstreamGatewayTimeoutError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("restarts a code from page 1 when total_items shifts mid-walk, and does not resume mid-page", async () => {
    const fetchFn = vi
      .fn()
      // attempt 1, page 1: total_items = 5
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({ has_next: true, total_pages: 2, total_items: 5 }),
        ),
      )
      // attempt 1, page 2: total_items shifted to 7 -> discard, restart
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            page: 2,
            has_next: false,
            total_pages: 2,
            total_items: 7,
          }),
        ),
      )
      // attempt 2, page 1: stable at 7
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            data: [{ id: "a" }],
            has_next: true,
            total_pages: 2,
            total_items: 7,
          }),
        ),
      )
      // attempt 2, page 2: stable at 7
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            data: [{ id: "b" }],
            page: 2,
            has_next: false,
            total_pages: 2,
            total_items: 7,
          }),
        ),
      );
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
      retryBaseDelayMs: 1,
    });

    const result = await client.fetchDiseaseGroup(baseParams);

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result.totalItems).toBe(7);
    expect(result.rows).toEqual([{ id: "a" }, { id: "b" }]);
    const pagesRequested = fetchFn.mock.calls.map(([url]: [URL]) =>
      url.searchParams.get("page"),
    );
    expect(pagesRequested).toEqual(["1", "2", "1", "2"]);
  });

  it("throws a client timeout, retryable, when no response arrives inside timeoutMs", async () => {
    const fetchFn = vi.fn((_url: URL, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 5,
      retryBaseDelayMs: 1,
    });

    const error = await client.fetchDiseaseGroup(baseParams).catch((e) => e);

    expect(error).toBeInstanceOf(UpstreamRetriesExhaustedError);
    expect((error as UpstreamRetriesExhaustedError).lastError).toBeInstanceOf(
      UpstreamTimeoutError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("never lets a response body reach the logger, including on an error path", async () => {
    const sentinel = "SENTINEL-PLAINTEXT-CASE-DATA";
    const fetchFn = vi.fn(async () =>
      jsonResponse({ status: true, message: sentinel }, { status: 401 }),
    );
    const logger = spyLogger();
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
      logger,
    });

    const error = await client.fetchDiseaseGroup(baseParams).catch((e) => e);

    expect(error).toBeInstanceOf(UpstreamAuthError);
    expect((error as Error).message).not.toContain(sentinel);
    for (const line of [...logger.calls, ...logger.errors]) {
      expect(line).not.toContain(sentinel);
    }
  });

  it("logs status, group code, page and total_items on a successful call", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(envelope({ total_items: 42 })),
    );
    const logger = spyLogger();
    const client = new UpstreamClient({
      baseUrl: "https://upstream.example",
      token: "t",
      fetchFn,
      logger,
    });

    await client.fetchDiseaseGroup(baseParams);

    expect(logger.calls).toHaveLength(1);
    const logged = JSON.parse(logger.calls[0]);
    expect(logged).toMatchObject({
      status: 200,
      groupCode: 209,
      page: 1,
      totalItems: 42,
    });
  });
});
