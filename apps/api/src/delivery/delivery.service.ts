import { eq } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { request } from '../db/schema';
import {
  type ArchiveStore,
  type RangedObject,
} from '../extraction/archive-store';
import { type LookupContext, recordLookup } from './token-lookups';
import { DownloadThrottle } from './download-throttle';
import { DownloadTokens } from './download-tokens.repository';
import { parseRange } from './range';
import { resolveArchiveAttempt, resolvePageLookup } from './resolve-token';

export type PageOutcome =
  | {
      kind: 'ok';
      reference: string;
      archiveFilename: string;
      sizeBytes: number;
      attemptsUsed: number;
      timeLeftMs: number;
    }
  | { kind: 'dead' }
  | { kind: 'blocked' };

export type ArchiveOutcome =
  | { kind: 'ok'; archiveFilename: string; ranged: RangedObject }
  | { kind: 'dead' }
  | { kind: 'blocked' };

export class DeliveryService {
  constructor(
    private readonly db: Db,
    private readonly downloadTokens: DownloadTokens,
    private readonly throttle: DownloadThrottle,
    private readonly archiveStore: ArchiveStore,
  ) {}

  private async referenceOf(requestId: string): Promise<string> {
    const [row] = await this.db
      .select({ reference: request.reference })
      .from(request)
      .where(eq(request.id, requestId));
    return row.reference;
  }

  /**
   * A failed presentation's fate once it's already been resolved and
   * audited: a fresh block-worthy IP counts against the throttle and still
   * gets the ordinary dead-token redirect; an already-blocked IP is refused
   * outright, without counting again (spec §9.2 — the block must not
   * re-extend itself on every subsequent hit, and it must never touch a
   * *successful* presentation, which this is only ever reached for the
   * opposite of).
   */
  private async failureOutcome(
    ip: string,
    now: Date,
  ): Promise<'dead' | 'blocked'> {
    if (await this.throttle.isBlocked(ip, now)) return 'blocked';
    await this.throttle.recordFailure(ip, now);
    return 'dead';
  }

  /** `GET /d/<token>` (ADR 0018): a lookup, never an Attempt. */
  async page(
    rawToken: string,
    ctx: LookupContext,
    now: Date,
  ): Promise<PageOutcome> {
    const row = await this.downloadTokens.findByRawToken(rawToken);
    const outcome = resolvePageLookup(row, now);
    await recordLookup(this.db, {
      rawToken,
      downloadTokenId: row?.id ?? null,
      requestId: row?.requestId ?? null,
      kind: 'page',
      outcome,
      now,
      ...ctx,
    });

    if (outcome !== 'success') {
      return { kind: await this.failureOutcome(ctx.ip, now) };
    }

    const row2 = row!;
    const [sizeBytes, attemptsUsed, reference] = await Promise.all([
      this.archiveStore.stat(row2.archiveFilename),
      this.downloadTokens.successfulArchiveAttempts(row2.id),
      this.referenceOf(row2.requestId),
    ]);

    return {
      kind: 'ok',
      reference,
      archiveFilename: row2.archiveFilename,
      sizeBytes: sizeBytes ?? 0,
      attemptsUsed,
      timeLeftMs: row2.expiresAt.getTime() - now.getTime(),
    };
  }

  /** `GET /d/<token>/archive`: the Attempt route (spec §9.2, ADR 0018). `rangeHeader` is the raw `Range` request header, parsed here once the object's size is known. */
  async archive(
    rawToken: string,
    ctx: LookupContext,
    rangeHeader: string | undefined,
    now: Date,
  ): Promise<ArchiveOutcome> {
    const row = await this.downloadTokens.findByRawToken(rawToken);
    const priorAttempts = row
      ? await this.downloadTokens.successfulArchiveAttempts(row.id)
      : 0;
    const sizeBytes = row
      ? await this.archiveStore.stat(row.archiveFilename)
      : null;
    const outcome = resolveArchiveAttempt(
      row,
      now,
      priorAttempts,
      sizeBytes !== null,
    );

    await recordLookup(this.db, {
      rawToken,
      downloadTokenId: row?.id ?? null,
      requestId: row?.requestId ?? null,
      kind: 'archive',
      outcome,
      now,
      ...ctx,
    });

    if (outcome !== 'success') {
      return { kind: await this.failureOutcome(ctx.ip, now) };
    }

    const row2 = row!;
    const range = parseRange(rangeHeader, sizeBytes ?? 0) ?? undefined;
    const ranged = await this.archiveStore.download(
      row2.archiveFilename,
      range,
    );
    return { kind: 'ok', archiveFilename: row2.archiveFilename, ranged };
  }
}
