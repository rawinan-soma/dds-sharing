import { eq } from 'drizzle-orm';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { request } from '../db/schema';
import { type Area, type ProvinceName, describeArea } from '../reference/area';

/**
 * What a Requester asked for (CONTEXT.md, Request): the Disease group, the
 * inclusive dates and the Area selection, as people read them back. Never
 * the row count.
 */
export interface Ask {
  diseaseGroupName: string;
  /** Inclusive `YYYY-MM-DD` days, as the Requester gave them. */
  startDate: string;
  endDate: string;
  area: Area;
}

/** A stored Request's ask, its provinces named through `provinces`. */
export async function readAsk(
  db: NodePgDatabase,
  requestId: string,
  provinces: readonly ProvinceName[],
): Promise<Ask> {
  const [row] = await db
    .select({
      diseaseGroupName: request.diseaseGroupName,
      startDate: request.startDate,
      endDate: request.endDate,
      provinces: request.provinces,
    })
    .from(request)
    .where(eq(request.id, requestId));
  return {
    diseaseGroupName: row.diseaseGroupName,
    startDate: row.startDate,
    endDate: row.endDate,
    area: describeArea(row.provinces, provinces),
  };
}
