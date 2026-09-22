// The extraction pipeline (spec §7): fetch -> filter -> project -> assert
// completeness, one Report code at a time, in ascending order — that order is
// the Extract's row order and must not be varied for throughput, of which
// there is none to gain (§5.3). Raw upstream rows never leave this module:
// each code's rows are filtered and projected before the next code is
// fetched, and only the projected rows and small counts are returned.
//
// Writing the Extract to disk is the next slice (#70). This module's contract
// ends at rows in memory, plus everything the writer and `job_completed` will
// need: per-code counts, the `x-request-id`s, the unknown-field names seen,
// and the impossible-derivation count.

import {
  buildSpan,
  type RequestDates,
  type Span,
} from '../upstream/span-builder';
import { type UpstreamPage } from '../upstream/upstream-client';
import {
  UpstreamError,
  type UpstreamErrorKind,
} from '../upstream/upstream-error';
import type {
  CodeFetchDetail,
  JobFailureCause,
} from '../audit/event-catalogue';
import { EXTRACTION_DEFAULTS } from './extraction.config';
import { filterRow } from './filter';
import {
  newProjectCounters,
  projectRow,
  StaleProvinceTableError,
  type ProjectCounters,
  type ProjectedRow,
} from './project';

export interface ExtractionTarget {
  requestId: string;
  reportCodes: string[];
  /** Inclusive, `YYYY-MM-DD`, exactly as the Requester gave them. */
  startDate: string;
  endDate: string;
  /** Empty means national (spec §4.4). */
  provinces: string[];
}

export type CodeFetchedPayload = CodeFetchDetail & {
  rowsReceived: number;
  totalItems: number;
};

export interface ExtractionSummary {
  reportCodes: string[];
  rowsByCode: Record<string, number>;
  totalItemsByCode: Record<string, number>;
  missingEpidemChwCode: number;
  impossibleDerivationInputs: number;
  unknownFieldNames: string[];
  xRequestIds: string[];
}

export interface ExtractionResult {
  /** In memory only, per Report code, ascending order (spec §7.2, §8.2). */
  rowsByCode: Record<string, ProjectedRow[]>;
  summary: ExtractionSummary;
}

/** The job fails and publishes nothing (spec §7.5, §7.6). */
export class ExtractionFailure extends Error {
  constructor(
    readonly cause: JobFailureCause,
    readonly xRequestId: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionFailure';
  }
}

function causeOf(kind: UpstreamErrorKind): JobFailureCause {
  // Everything upstream can throw at the client is either the token dying
  // mid-job or upstream itself acting up; spec §12.4's closed cause set does
  // not distinguish further (a validation error here is as much "upstream is
  // not answering the request we sent" as a 500 is).
  return kind === 'token_invalid' ? 'auth_expiry' : 'upstream_5xx';
}

/** What this module needs from `UpstreamClient` — narrow on purpose so a spec
 * can hand it a plain fake generator instead of the real class. */
export interface UpstreamPager {
  pages(groupCode: string, span: Span): AsyncGenerator<UpstreamPage>;
}

export interface ExtractionPipelineDeps {
  upstream: UpstreamPager;
  /** Read once at job start and held (spec §6.4) — province id -> health region. */
  provinces: ReadonlyMap<string, number>;
  now: () => Date;
  /** Injectable so a spec does not wait out a real backoff. */
  sleep: (ms: number) => Promise<void>;
  /** Fires once per Report code, in order, so the caller can write the event. */
  onCodeFetched: (payload: CodeFetchedPayload) => Promise<void>;
  /** Fires after each Report code — the stall guard's only progress signal. */
  touch: () => void;
  config?: Partial<typeof EXTRACTION_DEFAULTS>;
}

async function fetchOneCode(
  groupCode: string,
  span: Span,
  provinces: readonly string[],
  deps: ExtractionPipelineDeps,
  counters: ProjectCounters,
): Promise<{
  rows: ProjectedRow[];
  payload: CodeFetchedPayload;
  missing: number;
}> {
  const cfg = { ...EXTRACTION_DEFAULTS, ...deps.config };
  let lastError: UpstreamError | undefined;

  for (let attempt = 1; attempt <= cfg.codeMaxAttempts; attempt++) {
    const rawRows: Record<string, unknown>[] = [];
    let totalItems = 0;
    let pageCount = 0;
    let lastRequestId: string | null = null;

    try {
      // A fresh generator every attempt: no mid-code resume (spec §7.6) — a
      // partial walk plus a fresh tail is how a quietly-wrong file ships.
      for await (const page of deps.upstream.pages(groupCode, span)) {
        pageCount += 1;
        totalItems = page.meta.totalItems;
        lastRequestId = page.requestId ?? lastRequestId;
        rawRows.push(...page.rows);
      }
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      lastError = error;
      if (attempt < cfg.codeMaxAttempts) {
        await deps.sleep(cfg.codeBackoffBaseMs * 2 ** (attempt - 1));
        continue;
      }
      throw new ExtractionFailure(
        causeOf(error.kind),
        error.requestId,
        `code ${groupCode} exhausted ${cfg.codeMaxAttempts} attempts: ${error.message}`,
      );
    }

    // Completeness: rows received against this attempt's own total_items —
    // never a value carried over from an earlier, failed attempt, so a
    // `total_items` that moved between attempts needs no special case (spec
    // §7.6): every attempt starts from page 1 with no carried state.
    if (rawRows.length !== totalItems) {
      throw new ExtractionFailure(
        'completeness_mismatch',
        lastRequestId,
        `code ${groupCode}: received ${rawRows.length}, expected ${totalItems}`,
      );
    }

    let missing = 0;
    const kept: Record<string, unknown>[] = [];
    for (const row of rawRows) {
      const outcome = filterRow(row, provinces);
      if (outcome.epidemChwCodeMissing) missing += 1;
      if (outcome.kept) kept.push(row);
    }
    const rows = kept.map((row) =>
      projectRow(row, groupCode, deps.provinces, deps.now(), counters),
    );

    return {
      rows,
      missing,
      payload: {
        groupCode,
        startDate: span.startDate,
        endDate: span.endDate,
        pageCount,
        xRequestId: lastRequestId,
        rowsReceived: rawRows.length,
        totalItems,
      },
    };
  }
  // Unreachable: the loop above always returns or throws by its last attempt.
  throw lastError!;
}

export async function runExtraction(
  target: ExtractionTarget,
  deps: ExtractionPipelineDeps,
): Promise<ExtractionResult> {
  const codes = [...target.reportCodes].sort();
  const span = buildSpan({
    from: target.startDate,
    to: target.endDate,
  } satisfies RequestDates);
  const counters = newProjectCounters();

  const rowsByCode: Record<string, ProjectedRow[]> = {};
  const summary: ExtractionSummary = {
    reportCodes: codes,
    rowsByCode: {},
    totalItemsByCode: {},
    missingEpidemChwCode: 0,
    impossibleDerivationInputs: 0,
    unknownFieldNames: [],
    xRequestIds: [],
  };

  for (const groupCode of codes) {
    let outcome: Awaited<ReturnType<typeof fetchOneCode>>;
    try {
      outcome = await fetchOneCode(
        groupCode,
        span,
        target.provinces,
        deps,
        counters,
      );
    } catch (error) {
      if (error instanceof StaleProvinceTableError) {
        throw new ExtractionFailure(
          'internal',
          null,
          `code ${groupCode}: ${error.message}`,
        );
      }
      throw error;
    }

    rowsByCode[groupCode] = outcome.rows;
    summary.rowsByCode[groupCode] = outcome.rows.length;
    summary.totalItemsByCode[groupCode] = outcome.payload.totalItems;
    summary.missingEpidemChwCode += outcome.missing;
    if (outcome.payload.xRequestId) {
      summary.xRequestIds.push(outcome.payload.xRequestId);
    }

    deps.touch();
    await deps.onCodeFetched(outcome.payload);
  }

  summary.impossibleDerivationInputs = counters.impossibleDerivationInputs;
  summary.unknownFieldNames = [...counters.unknownFieldNames].sort();

  return { rowsByCode, summary };
}
