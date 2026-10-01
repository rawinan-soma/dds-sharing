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

/** The `request` columns an Ask is read from, for a select to spread. */
export const ASK_COLUMNS = {
  diseaseGroupName: request.diseaseGroupName,
  startDate: request.startDate,
  endDate: request.endDate,
  provinces: request.provinces,
};

/** A row selected with {@link ASK_COLUMNS}, its provinces named through `provinces`. */
export function askOf(
  row: {
    diseaseGroupName: string;
    startDate: string;
    endDate: string;
    provinces: readonly string[];
  },
  provinces: readonly ProvinceName[],
): Ask {
  return {
    diseaseGroupName: row.diseaseGroupName,
    startDate: row.startDate,
    endDate: row.endDate,
    area: describeArea(row.provinces, provinces),
  };
}

/** A stored Request's ask. */
export async function readAsk(
  db: NodePgDatabase,
  requestId: string,
  provinces: readonly ProvinceName[],
): Promise<Ask> {
  const [row] = await db
    .select(ASK_COLUMNS)
    .from(request)
    .where(eq(request.id, requestId));
  if (!row) throw new Error(`readAsk: request ${requestId} does not exist`);
  return askOf(row, provinces);
}
