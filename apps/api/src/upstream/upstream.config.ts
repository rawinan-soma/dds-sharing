// Everything the service knows about how to talk to the upstream DDC API.
// Verified behaviour (spec §5) supersedes the published field dictionary, which
// has four documented errors.

export const DEFAULT_BASE_URL = 'https://exchange.ddc.moph.go.th/api/d506/v1';

/**
 * The only query parameter names the client may send. Unknown parameters are
 * silently ignored upstream — a mistyped name yields a cheerful 200 with
 * unfiltered data, not an error — so a name outside this set must never leave.
 */
export const KNOWN_PARAMS = [
  'group_code',
  'start_date',
  'end_date',
  'page',
  'page_size',
] as const;

export type KnownParam = (typeof KNOWN_PARAMS)[number];

/**
 * Cost is ~3.5 s fixed per request, near-independent of rows returned, so the
 * number of requests is the only cost driver: always fetch at the maximum.
 */
export const FETCH_PAGE_SIZE = 10_000;

/** The Probe reads only `meta.total_items`, so it asks for the smallest page. */
export const PROBE_PAGE_SIZE = 20;

/** Undocumented but real: upstream answers 422 below this. Never emit less. */
export const MIN_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 10_000;

/**
 * Extraction is sequential, and the global concurrency budget is 1 (spec §13.2).
 * DO NOT raise this expecting throughput: it was measured, and concurrency buys
 * nothing. Eight concurrent calls all returned 200 but degraded from ~3.9 s to
 * ~14.3 s each, because upstream serializes them. A higher number only spends
 * more of the one bearer token's standing — and the failure to fear is not a
 * throttle (no rate-limit headers, no 429 was ever seen) but DDC noticing our
 * traffic and revoking the token, which no retry recovers from.
 *
 * Nothing in the client reads this; it exists so the reason is written next to
 * the number, where the next operator who wants to tune it will look.
 */
export const UPSTREAM_CONCURRENCY = 1;

export const UPSTREAM_DEFAULTS = {
  /** 3 attempts per request (spec §7.6). */
  maxAttempts: 3,
  /** Exponential: 1 s, then 2 s, between the attempts. */
  backoffBaseMs: 1_000,
  /** Matches the upstream gateway's own 60 s cut-off. */
  timeoutMs: 60_000,
} as const;
