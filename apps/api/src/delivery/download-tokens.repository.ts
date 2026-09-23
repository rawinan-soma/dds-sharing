import { and, eq, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { downloadToken, tokenLookup } from '../db/schema';
import { hashToken } from './token';
import { type DownloadTokenRow } from './resolve-token';

const HOURS_72_MS = 72 * 60 * 60 * 1000;

export class DownloadTokens {
  constructor(private readonly db: Db) {}

  /** Persists a fresh Download token, anchored 72 hours from job completion (spec §9.3). */
  async create(
    requestId: string,
    rawToken: string,
    archiveFilename: string,
    now: Date,
  ): Promise<DownloadTokenRow> {
    const [row] = await this.db
      .insert(downloadToken)
      .values({
        requestId,
        tokenHash: hashToken(rawToken),
        archiveFilename,
        createdAt: now,
        expiresAt: new Date(now.getTime() + HOURS_72_MS),
      })
      .returning();
    return row;
  }

  async findByRawToken(rawToken: string): Promise<DownloadTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(downloadToken)
      .where(eq(downloadToken.tokenHash, hashToken(rawToken)));
    return row ?? null;
  }

  /** Prior *successful* archive-route presentations of this token — the cap (spec §9.2). */
  async successfulArchiveAttempts(downloadTokenId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokenLookup)
      .where(
        and(
          eq(tokenLookup.downloadTokenId, downloadTokenId),
          eq(tokenLookup.kind, 'archive'),
          eq(tokenLookup.outcome, 'success'),
        ),
      );
    return count;
  }

  /** For a future Re-run (#74, ADR 0012): revokes at the moment a new Extract is ready. */
  async revoke(id: string, now: Date): Promise<void> {
    await this.db
      .update(downloadToken)
      .set({ revokedAt: now })
      .where(eq(downloadToken.id, id));
  }
}
