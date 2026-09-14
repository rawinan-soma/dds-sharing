import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_DB, type AppDb } from "../db/app-db.module.js";
import { requestEvent } from "../db/schema.js";
import type {
  ProbeFailedPayload,
  ProbePerformedPayload,
} from "../db/events.js";
import { buildSpan, type RequestDateRange } from "../upstream/span-builder.js";
import { UpstreamProbeExhaustedError } from "../upstream/upstream-client-errors.js";
import {
  MIN_PAGE_SIZE,
  type UpstreamClient,
} from "../upstream/upstream-client.js";
import { UPSTREAM_CLIENT } from "../upstream/upstream.module.js";

export interface ProbeRunInput extends RequestDateRange {
  requestId: string;
  reportCodes: string[];
}

/**
 * §5.4: one `page_size=20` call per Report code, over the Request's whole
 * span, purely to read `meta.total_items` — fired off the submit path and
 * awaited by nobody. The date range comes from the shared span builder
 * alone (§4.3, §7.2) — this service holds no date arithmetic of its own.
 */
@Injectable()
export class ProbeService {
  private readonly logger = new Logger(ProbeService.name);

  constructor(
    @Inject(APP_DB) private readonly appDb: AppDb,
    @Inject(UPSTREAM_CLIENT) private readonly upstreamClient: UpstreamClient,
  ) {}

  /**
   * Never rejects — nothing waits on the Probe, human or machine (§5.4), so
   * a caller that fires this without awaiting it can never crash on an
   * unhandled rejection. A code exhausting its attempts is an expected
   * outcome, recorded as `probe_failed`; anything else is an unexpected
   * fault, logged rather than left to propagate.
   */
  async run(input: ProbeRunInput): Promise<void> {
    try {
      await this.runOrThrow(input);
    } catch (error) {
      this.logger.error(
        `Probe run failed unexpectedly for request ${input.requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async runOrThrow(input: ProbeRunInput): Promise<void> {
    const span = buildSpan({ from: input.from, to: input.to });
    const { db } = this.appDb;

    const codes: ProbePerformedPayload["codes"] = [];
    let totalItems = 0;

    for (const reportCode of input.reportCodes) {
      let result;
      try {
        result = await this.upstreamClient.probeDiseaseGroup({
          groupCode: Number(reportCode),
          startDate: span.startDate,
          endDate: span.endDate,
          pageSize: MIN_PAGE_SIZE,
        });
      } catch (error) {
        if (!(error instanceof UpstreamProbeExhaustedError)) throw error;

        // One code's exhausted retries abandon the whole Probe (§5.4) — the
        // codes already probed before it are not recorded; only the
        // accountability trail for the code that failed is.
        await db.insert(requestEvent).values({
          requestId: input.requestId,
          type: "probe_failed",
          actorType: "system",
          payload: {
            groupCode: reportCode,
            errors: error.attempts.map((attempt) => ({
              message: attempt.errorKind,
              xRequestId: attempt.requestId ?? null,
            })),
          } satisfies ProbeFailedPayload,
          occurredAt: new Date(),
        });
        return;
      }

      codes.push({
        groupCode: reportCode,
        calls: result.callsMade,
        totalItems: result.totalItems,
        xRequestIds: result.requestIds,
      });
      totalItems += result.totalItems;
    }

    await db.insert(requestEvent).values({
      requestId: input.requestId,
      type: "probe_performed",
      actorType: "system",
      payload: {
        span: { start: span.startDate, end: span.endDate },
        codes,
        totalItems,
      } satisfies ProbePerformedPayload,
      occurredAt: new Date(),
    });
  }
}
