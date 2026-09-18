// A fake of the upstream DDC API, for development and CI. It is an implementers'
// dev harness and explicitly NOT a product deliverable (spec §17.3). It exists
// because §7.6's retry behaviour cannot be tested at all without it.
//
// STANDING CONSTRAINT: no real patient data ever seeds it — see synthetic-rows.ts.
//
// It mimics the verified upstream behaviour of spec §5 (envelope, 1-based page,
// exclusive end_date, silent unknown parameters, empty 200 for an unknown code,
// the failure taxonomy) and exposes the five fault paths the retry work needs:
//
//   server-error     a 500 mid-loop
//   slow-page        a page held back
//   truncated-page   a body cut off mid-JSON
//   auth-expiry      a token that stops working mid-job
//   shifting-total   a `total_items` that moves between attempts — the one no
//                    fixture can produce, and the one that tests §7.6's guard

import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { DAYS_IN_CYCLE, onsetDayMs, syntheticRow } from './synthetic-rows';

export const DEFAULT_TOKEN = 'fake-upstream-token';
const MAX_SPAN_DAYS = 365;
const MIN_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 10_000;
// "Far beyond total_pages" is a 400; one past the end is an empty 200 (§5.1).
const PAGE_TOO_LARGE_MARGIN = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type Fault =
  | { kind: 'server-error'; page: number; times: number }
  | { kind: 'slow-page'; page: number; delayMs: number; times: number }
  | { kind: 'truncated-page'; page: number; times: number }
  | { kind: 'auth-expiry'; afterRequests: number }
  | { kind: 'shifting-total' };

export interface FakeUpstreamOptions {
  token?: string;
  /** Synthetic rows per Report code, before any date filter. Default 100. */
  rowsPerCode?: number;
  /** Report codes with rows. Any other code answers 200 with no rows. */
  knownCodes?: string[];
  /** A string planted in every field and every error body. */
  sentinel?: string;
  port?: number;
}

export interface RecordedRequest {
  query: Record<string, string>;
  authorization: string | undefined;
}

export interface FakeUpstream {
  /** Base URL, ending in the API prefix; append `/disease-groups`. */
  url: string;
  token: string;
  requests: RecordedRequest[];
  setFault(fault: Fault | null): void;
  close(): Promise<void>;
}

const DEFAULT_CODES = [
  ...Array.from({ length: 24 }, (_, i) => String(201 + i)),
  '501',
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string | undefined): number | null {
  if (value === undefined || !DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export async function createFakeUpstream(
  options: FakeUpstreamOptions = {},
): Promise<FakeUpstream> {
  const token = options.token ?? DEFAULT_TOKEN;
  const rowsPerCode = options.rowsPerCode ?? 100;
  const knownCodes = new Set(options.knownCodes ?? DEFAULT_CODES);
  const sentinel = options.sentinel ?? '';
  const requests: RecordedRequest[] = [];

  let fault: Fault | null = null;
  let served = 0;
  let extraRows = 0;

  function send(
    res: ServerResponse,
    status: number,
    body: unknown,
    started: number,
  ) {
    res.writeHead(status, {
      'content-type': 'application/json',
      'x-request-id': randomUUID(),
      'x-process-time-ms': String(Date.now() - started),
    });
    res.end(JSON.stringify(body));
  }

  function fail(
    res: ServerResponse,
    status: number,
    message: string,
    started: number,
    errors?: { field: string; message: string }[],
  ) {
    // A hostile body on purpose: an error handler that reaches for it leaks.
    const detail = sentinel ? ` ${sentinel}` : '';
    send(
      res,
      status,
      { status: false, message: message + detail, ...(errors && { errors }) },
      started,
    );
  }

  function truncate(res: ServerResponse, body: unknown) {
    const text = JSON.stringify(body);
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(text)),
      'x-request-id': randomUUID(),
      'x-process-time-ms': '1',
    });
    res.write(text.slice(0, Math.floor(text.length / 2)));
    // Drop the connection with the promised bytes unsent.
    setTimeout(() => res.socket?.destroy(), 5);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://fake');
    if (!url.pathname.endsWith('/disease-groups')) {
      return fail(res, 404, 'Not Found', started);
    }
    const query = Object.fromEntries(url.searchParams);
    requests.push({ query, authorization: req.headers.authorization });

    if (req.headers.authorization !== `Bearer ${token}`) {
      return fail(res, 401, 'Token invalid', started);
    }
    if (fault?.kind === 'auth-expiry' && served >= fault.afterRequests) {
      return fail(res, 401, 'Token invalid', started);
    }

    const pageSize = Number(query.page_size ?? 100);
    const page = Number(query.page ?? 1);
    const fieldErrors: { field: string; message: string }[] = [];
    if (
      !Number.isInteger(pageSize) ||
      pageSize < MIN_PAGE_SIZE ||
      pageSize > MAX_PAGE_SIZE
    ) {
      fieldErrors.push({ field: 'page_size', message: 'out of bounds' });
    }
    if (!Number.isInteger(page) || page < 1) {
      fieldErrors.push({ field: 'page', message: 'must be at least 1' });
    }
    const startMs = parseDay(query.start_date);
    const endMs = parseDay(query.end_date);
    if (query.start_date !== undefined && startMs === null) {
      fieldErrors.push({ field: 'start_date', message: 'invalid date' });
    }
    if (query.end_date !== undefined && endMs === null) {
      fieldErrors.push({ field: 'end_date', message: 'invalid date' });
    }
    if (fieldErrors.length > 0) {
      return fail(res, 422, 'Validation Error', started, fieldErrors);
    }
    if (startMs !== null && endMs !== null) {
      if (endMs < startMs) return fail(res, 422, 'Invalid range', started);
      if ((endMs - startMs) / ONE_DAY_MS > MAX_SPAN_DAYS) {
        return fail(
          res,
          400,
          'Date range must not exceed 1 year (365 days)',
          started,
        );
      }
    }

    // Faults that fire before the body is built.
    if (
      fault?.kind === 'server-error' &&
      fault.page === page &&
      fault.times > 0
    ) {
      fault.times -= 1;
      return fail(res, 500, 'Internal Server Error', started);
    }
    if (fault?.kind === 'slow-page' && fault.page === page && fault.times > 0) {
      fault.times -= 1;
      const { delayMs } = fault;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    if (fault?.kind === 'shifting-total' && page === 1) {
      extraRows += 1; // upstream keeps receiving reports between attempts
    }

    const code = query.group_code ?? '';
    const available = knownCodes.has(code)
      ? rowsPerCode + (fault?.kind === 'shifting-total' ? extraRows : 0)
      : 0;
    const matching: number[] = [];
    for (let i = 0; i < available; i++) {
      const day = onsetDayMs(i);
      if (
        (startMs === null || day >= startMs) &&
        (endMs === null || day < endMs)
      ) {
        matching.push(i);
      }
    }
    const totalItems = matching.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (page > totalPages + PAGE_TOO_LARGE_MARGIN) {
      return fail(res, 400, 'Page too large', started);
    }
    const slice = matching.slice((page - 1) * pageSize, page * pageSize);
    const body = {
      status: true,
      message: 'OK',
      data: slice.map((i) => syntheticRow(code, i, sentinel)),
      meta: {
        page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1,
      },
    };

    if (
      fault?.kind === 'truncated-page' &&
      fault.page === page &&
      fault.times > 0
    ) {
      fault.times -= 1;
      served += 1;
      return truncate(res, body);
    }
    served += 1;
    send(res, 200, body, started);
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, '127.0.0.1', resolve),
  );
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/d506/v1`,
    token,
    requests,
    setFault(next) {
      fault = next ? { ...next } : null;
      served = 0;
      extraRows = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export { DAYS_IN_CYCLE };
