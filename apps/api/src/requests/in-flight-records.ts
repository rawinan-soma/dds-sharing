import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { type Executor } from '../audit/write-request-event';
import { downloadToken, extractionJob } from '../db/schema';
import { type InFlightFacts } from './in-flight';

// What `in-flight.ts` reads, read out of the record now. Plain functions over
// an executor, so the Reviewer's reads and the job's issue-at-ready check can
// run them inside their own transaction.

export type CurrentToken = NonNullable<InFlightFacts['token']> & {
  id: string;
  archiveFilename: string;
};

/** What `inFlightRow` needs to know about one Request, read now. */
export async function factsOf(
  db: Executor,
  requestId: string,
  state: InFlightFacts['state'],
): Promise<InFlightFacts & { token: CurrentToken | null }> {
  const [job] = await db
    .select({ status: extractionJob.status })
    .from(extractionJob)
    .where(eq(extractionJob.requestId, requestId))
    .orderBy(desc(extractionJob.createdAt))
    .limit(1);
  return {
    state,
    job: job?.status ?? null,
    token: await currentToken(db, requestId),
  };
}

/** The newest Download token no Re-run revoked, and its Attempts so far. */
export async function currentToken(
  db: Executor,
  requestId: string,
): Promise<CurrentToken | null> {
  const [token] = await db
    .select({
      id: downloadToken.id,
      expiresAt: downloadToken.expiresAt,
      archiveFilename: downloadToken.archiveFilename,
      // Qualified by hand: drizzle drops the table from a column inside a
      // subquery, and `id` alone would bind to `token_lookup`'s.
      attempts: sql<number>`(
        SELECT count(*)::int FROM token_lookup l
        WHERE l.download_token_id = download_token.id
          AND l.kind = 'archive' AND l.outcome = 'success')`,
    })
    .from(downloadToken)
    .where(
      and(
        eq(downloadToken.requestId, requestId),
        isNull(downloadToken.revokedAt),
      ),
    )
    .orderBy(desc(downloadToken.createdAt))
    .limit(1);
  return token ?? null;
}
