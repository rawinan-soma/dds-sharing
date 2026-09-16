import { buildSpan } from "../upstream/span-builder.js";
import type { UpstreamClient } from "../upstream/upstream-client.js";
import { matchesAreaFilter } from "./filter.js";
import type { ProvinceLookup } from "./epidem-health-zone.js";
import {
  CompletenessMismatchError,
  classifyExtractionFailure,
} from "./job-failure.js";
import { newProjectionCounters, projectRow, type ProjectedRow, type ProjectionCounters } from "./project.js";
import type { ScratchStore } from "./scratch-store.js";
import { raceAgainstStall, STALL_TIMEOUT_MS } from "./stall-watchdog.js";

export interface ExtractionRunInput {
  requestId: string;
  /** Not assumed sorted — the runner sorts ascending itself (spec §7.2). */
  reportCodes: readonly string[];
  fromDate: string;
  toDate: string;
  /** Empty for a national Request (spec §4.4, §7.3). */
  areaProvinces: readonly string[];
}

export interface CodeFetchedEvent {
  groupCode: string;
  startDate: string;
  endDate: string;
  pageCount: number;
  xRequestId: string;
  rowsReceived: number;
  totalItems: number;
}

export interface ExtractionRunnerEvents {
  onCodeFetched(event: CodeFetchedEvent): Promise<void> | void;
}

export interface ExtractionRunResult {
  /** Every included row of every code, in fetch order (spec §8.1: code ascending, then upstream's own order within a code). */
  rows: ProjectedRow[];
  counters: ProjectionCounters;
  /** Rows whose `epidem_chw_code` was absent — a data-quality signal, never a reason to drop the row from the count itself (spec §7.3). */
  absentEpidemChwCodeCount: number;
}

/**
 * Fetch → filter → project, per Report code, ascending (spec §7). Owns the
 * completeness assert (§7.5), the stall watchdog (§7.6) and per-code
 * scratch checkpointing (§7.6, §7.8) — but never touches Postgres or
 * BullMQ, so it can be driven against the fake upstream harness with no
 * infrastructure beyond an HTTP server (mirrors `UpstreamClient`'s own
 * harness tests). The processor (`extraction.processor.ts`) is the thin
 * layer that turns `onCodeFetched` into a `code_fetched` row and a thrown
 * failure into `job_failed`.
 */
export class ExtractionRunner {
  constructor(
    private readonly upstreamClient: UpstreamClient,
    private readonly scratchStore: ScratchStore,
    private readonly provinces: ProvinceLookup,
    /** Overridable only for tests — production always runs the real 2-minute detector (§7.6). */
    private readonly stallTimeoutMs: number = STALL_TIMEOUT_MS,
  ) {}

  async run(
    input: ExtractionRunInput,
    events: ExtractionRunnerEvents,
    now: Date = new Date(),
  ): Promise<ExtractionRunResult> {
    const span = buildSpan({ from: input.fromDate, to: input.toDate });
    const orderedCodes = [...input.reportCodes].sort(
      (a, b) => Number(a) - Number(b),
    );

    const counters = newProjectionCounters();
    const rows: ProjectedRow[] = [];
    let absentEpidemChwCodeCount = 0;

    try {
      for (const code of orderedCodes) {
        if (await this.scratchStore.hasCheckpoint(input.requestId, code)) {
          // Resumed after a worker restart (§7.6): this code already
          // completed on an earlier attempt, and its `code_fetched` event
          // already landed then — redoing neither.
          rows.push(
            ...(await this.scratchStore.readCheckpoint(input.requestId, code)),
          );
          continue;
        }

        const fetchResult = await raceAgainstStall(
          () =>
            this.upstreamClient.fetchDiseaseGroup({
              groupCode: Number(code),
              startDate: span.startDate,
              endDate: span.endDate,
            }),
          this.stallTimeoutMs,
        );

        // Completeness (§7.5): asserted on rows *received*, never on rows
        // written — the area filter legitimately changes that count. On
        // mismatch, fail outright: no checkpoint, no partial code.
        if (fetchResult.rows.length !== fetchResult.totalItems) {
          throw new CompletenessMismatchError(
            code,
            fetchResult.rows.length,
            fetchResult.totalItems,
            fetchResult.calls.at(-1)?.requestId ?? null,
          );
        }

        const projectedForCode: ProjectedRow[] = [];
        for (const row of fetchResult.rows) {
          const check = matchesAreaFilter(
            row["epidem_chw_code"],
            input.areaProvinces,
          );
          if (check.absent) absentEpidemChwCodeCount += 1;
          if (!check.included) continue;
          projectedForCode.push(
            projectRow(row, code, this.provinces, counters, now),
          );
        }

        await this.scratchStore.writeCheckpoint(
          input.requestId,
          code,
          projectedForCode,
        );
        rows.push(...projectedForCode);

        await events.onCodeFetched({
          groupCode: code,
          startDate: span.startDate,
          endDate: span.endDate,
          pageCount: fetchResult.calls.length,
          xRequestId: fetchResult.calls.at(-1)?.requestId ?? "",
          rowsReceived: fetchResult.rows.length,
          totalItems: fetchResult.totalItems,
        });
      }
    } catch (error) {
      throw classifyExtractionFailure(error);
    }

    return { rows, counters, absentEpidemChwCodeCount };
  }
}
