import { Inject, Injectable, Logger } from '@nestjs/common';
import { writeRequestEvent } from '../audit/write-request-event';
import { DB, type Db } from '../db/database.module';
import { buildSpan } from '../upstream/span-builder';
import { type ResponseInfo, UpstreamClient } from '../upstream/upstream-client';
import { UpstreamError } from '../upstream/upstream-error';

// The Probe (spec §5.4): one page_size=20 call per Report code, over the
// Request's whole span, to catch a Report code that matched nothing before the
// Requester waits on it, and to put upstream traffic spent on the reject path
// on the record. Nothing else reads a Probe response — not a row, not a page.

export interface ProbeTarget {
  requestId: string;
  reportCodes: string[];
  /** Inclusive, `YYYY-MM-DD`, exactly as the Requester gave them. */
  startDate: string;
  endDate: string;
}

@Injectable()
export class ProbeService {
  private readonly logger = new Logger(ProbeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly upstream: UpstreamClient,
  ) {}

  /**
   * Runs off the submit path: the caller does not await this, and it never
   * rejects — a bug here must strand only the count, never the caller. Approve
   * gates on nothing this writes (§5.4): there is no state for it to block.
   */
  async run(target: ProbeTarget, now = new Date()): Promise<void> {
    try {
      await this.probe(target, now);
    } catch (error) {
      this.logger.error(
        `Probe crashed for request ${target.requestId}: ${(error as Error).message}`,
      );
    }
  }

  private async probe(target: ProbeTarget, now: Date): Promise<void> {
    // Ascending order (spec §5.4 workflow step 3); the span comes from the
    // shared builder — the Probe holds no date arithmetic of its own.
    const codes = [...target.reportCodes].sort();
    const span = buildSpan({ from: target.startDate, to: target.endDate });
    const totalItemsByCode: Record<string, number> = {};
    const xRequestIds: string[] = [];

    for (const groupCode of codes) {
      const attempts: ResponseInfo[] = [];
      let page;
      try {
        page = await this.upstream.probe(groupCode, span, (info) =>
          attempts.push(info),
        );
      } catch (error) {
        if (!(error instanceof UpstreamError)) throw error;
        // A code's calls exhaust their retries: the whole Probe is abandoned.
        // Only this code's errors are relayed — the codes probed before it
        // succeeded, but recording a partial Probe is not what `probe_failed`
        // means (spec §5.4, §12.4). Every attempt that reached upstream is
        // relayed, not just the last: each one is traffic on the record, and
        // each has its own `x-request-id` for DDC support. A pure network or
        // pre-response timeout never reaches `onResponse`, so the caught
        // error itself is the fallback when nothing else was seen.
        const failed = attempts.filter(
          (a) => a.status < 200 || a.status >= 300,
        );
        const errors =
          failed.length > 0
            ? failed.map((a) => ({
                message: `Upstream error (status ${a.status})`,
                xRequestId: a.requestId,
              }))
            : [{ message: error.message, xRequestId: error.requestId }];
        await writeRequestEvent(this.db, {
          requestId: target.requestId,
          type: 'probe_failed',
          occurredAt: now,
          actor: { actorType: 'system' },
          payload: { groupCode, errors },
        });
        return;
      }
      totalItemsByCode[groupCode] = page.meta.totalItems;
      if (page.requestId) xRequestIds.push(page.requestId);
    }

    const totalItems = Object.values(totalItemsByCode).reduce(
      (sum, n) => sum + n,
      0,
    );
    await writeRequestEvent(this.db, {
      requestId: target.requestId,
      type: 'probe_performed',
      occurredAt: now,
      actor: { actorType: 'system' },
      payload: {
        reportCodes: codes,
        callsMade: codes.length,
        spanStart: span.startDate,
        spanEnd: span.endDate,
        totalItemsByCode,
        totalItems,
        xRequestIds,
      },
    });
  }
}
