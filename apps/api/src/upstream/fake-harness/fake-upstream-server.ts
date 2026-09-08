import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * An implementers' dev harness — not a product deliverable (§17.3). It exists
 * because §7.6's retry behaviour cannot be tested any other way: no fixture
 * can make `total_items` shift between attempts of the same call.
 *
 * Standing constraint: no real patient data ever seeds it. Every row this
 * harness returns is synthesised here, in this file.
 *
 * Five reserved `group_code` values select the five required paths; any
 * other `group_code` gets a two-page happy-path fixture. Set the
 * `x-fixture-sentinel` request header to have that value planted in every
 * returned row's fields (and, on an error path, in the error body) — the
 * seam the "no case data in a log" test (§17.1) hangs off.
 */
export const FAKE_UPSTREAM_SCENARIOS = {
  /** Page 1 succeeds; page 2 returns 500 on the first two attempts, then succeeds. */
  serverErrorMidLoop: 9500,
  /** Every page responds after a delay long enough to trip a short client timeout. */
  slowPage: 9501,
  /** Responds 200 with a body cut off mid-JSON — a parse failure, not a network one. */
  truncatedPage: 9502,
  /** Page 1 succeeds; page 2 returns 401 on every attempt (never recovers). */
  authExpiryMidJob: 9503,
  /** total_items disagrees between page 1 and page 2 on the first attempt, then stabilises. */
  shiftingTotalItems: 9504,
} as const;

const DISEASE_GROUPS_PATH = "/api/d506/v1/disease-groups";
export const SLOW_PAGE_DELAY_MS = 150;

export interface FakeUpstreamServerHandle {
  url: string;
  close(): Promise<void>;
}

function randomRequestId(): string {
  return `fake-${Math.random().toString(36).slice(2, 10)}`;
}

function sentinelRow(
  sentinel: string | undefined,
  id: number,
): Record<string, unknown> {
  return {
    id,
    patient_name: sentinel ?? `synthetic-${id}`,
    diagnosis_icd10_list: sentinel ?? "T67.0",
  };
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    "content-type": "application/json",
    "x-request-id": randomRequestId(),
    "x-process-time-ms": "3500",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function envelope(
  page: number,
  totalPages: number,
  totalItems: number,
  data: unknown[],
) {
  return {
    status: true,
    message: "OK",
    data,
    meta: {
      page,
      page_size: 10_000,
      total_items: totalItems,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_previous: page > 1,
    },
  };
}

export interface FakeUpstreamServerOptions {
  /** Defaults to 0 (an OS-assigned free port) — pass a fixed port for local dev use. */
  port?: number;
}

export function startFakeUpstreamServer(
  options: FakeUpstreamServerOptions = {},
): Promise<FakeUpstreamServerHandle> {
  // Per group_code, how many times page 1 has been requested — the "attempt"
  // counter for scenarios that only recover after a retry.
  const attemptsByGroupCode = new Map<number, number>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== DISEASE_GROUPS_PATH) {
      sendJson(res, 404, { status: false, message: "Not Found" });
      return;
    }

    const groupCode = Number(url.searchParams.get("group_code"));
    const page = Number(url.searchParams.get("page"));
    const sentinel = req.headers["x-fixture-sentinel"];
    const sentinelValue = Array.isArray(sentinel) ? sentinel[0] : sentinel;

    if (page === 1) {
      attemptsByGroupCode.set(
        groupCode,
        (attemptsByGroupCode.get(groupCode) ?? 0) + 1,
      );
    }
    const attempt = attemptsByGroupCode.get(groupCode) ?? 1;

    switch (groupCode) {
      case FAKE_UPSTREAM_SCENARIOS.serverErrorMidLoop: {
        if (page === 1) {
          sendJson(
            res,
            200,
            envelope(1, 2, 2, [sentinelRow(sentinelValue, 1)]),
          );
          return;
        }
        if (attempt <= 2) {
          sendJson(res, 500, {
            status: false,
            message: `Internal Server Error ${sentinelValue ?? ""}`.trim(),
          });
          return;
        }
        sendJson(res, 200, envelope(2, 2, 2, [sentinelRow(sentinelValue, 2)]));
        return;
      }

      case FAKE_UPSTREAM_SCENARIOS.slowPage: {
        setTimeout(
          () =>
            sendJson(
              res,
              200,
              envelope(1, 1, 1, [sentinelRow(sentinelValue, 1)]),
            ),
          SLOW_PAGE_DELAY_MS,
        );
        return;
      }

      case FAKE_UPSTREAM_SCENARIOS.truncatedPage: {
        res.writeHead(200, {
          "content-type": "application/json",
          "x-request-id": randomRequestId(),
          "x-process-time-ms": "3500",
        });
        const wholeBody = JSON.stringify(
          envelope(1, 1, 1, [sentinelRow(sentinelValue, 1)]),
        );
        res.end(wholeBody.slice(0, Math.floor(wholeBody.length / 2)));
        return;
      }

      case FAKE_UPSTREAM_SCENARIOS.authExpiryMidJob: {
        if (page === 1) {
          sendJson(
            res,
            200,
            envelope(1, 2, 2, [sentinelRow(sentinelValue, 1)]),
          );
          return;
        }
        sendJson(res, 401, {
          status: false,
          message: `Token invalid ${sentinelValue ?? ""}`.trim(),
        });
        return;
      }

      case FAKE_UPSTREAM_SCENARIOS.shiftingTotalItems: {
        const stable = attempt >= 2;
        if (page === 1) {
          sendJson(
            res,
            200,
            envelope(1, 2, stable ? 7 : 5, [sentinelRow(sentinelValue, 1)]),
          );
          return;
        }
        sendJson(res, 200, envelope(2, 2, 7, [sentinelRow(sentinelValue, 2)]));
        return;
      }

      default: {
        if (page === 1) {
          sendJson(
            res,
            200,
            envelope(1, 2, 2, [sentinelRow(sentinelValue, 1)]),
          );
          return;
        }
        sendJson(res, 200, envelope(2, 2, 2, [sentinelRow(sentinelValue, 2)]));
        return;
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) =>
              error ? closeReject(error) : closeResolve(),
            );
          }),
      });
    });
  });
}
