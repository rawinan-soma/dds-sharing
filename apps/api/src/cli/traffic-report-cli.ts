import { parseArgs } from 'node:util';
import { and, gte, inArray, lt, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { requestEvent } from '../db/schema';
import { type CliOutput, isArgumentError } from './cli-io';
import {
  DateRangeError,
  type InstantRange,
  parseBangkokDateRange,
} from './date-range';

// The upstream traffic report (spec §13.6). DDC issues one bearer token for
// the whole service and the failure mode is DDC revoking it, so "how much
// traffic are you sending?" must be answerable — by a human, a handful of
// times a year. Not a dashboard and not an endpoint.
//
// Counted from the record, whatever became of the Request: `probe_performed`
// covers every submit, rejected and expired ones included; `probe_failed`
// covers the calls an abandoned Probe spent; `code_fetched` covers running
// jobs.

const USAGE = `Usage:
  traffic-report --from <YYYY-MM-DD> --to <YYYY-MM-DD>
      Counts upstream calls between the two days, inclusive, in Bangkok time,
      split by Probe and fetch.`;

export interface UpstreamTraffic {
  probesPerformed: number;
  probePerformedCalls: number;
  probesAbandoned: number;
  probeAbandonedCalls: number;
  codeFetches: number;
  fetchCalls: number;
  requestsFetched: number;
}

export interface TrafficSource {
  count(range: InstantRange): Promise<UpstreamTraffic>;
}

export async function countUpstreamTraffic(
  db: Db,
  range: InstantRange,
): Promise<UpstreamTraffic> {
  const { type, payload, requestId } = requestEvent;
  const n = (expression: ReturnType<typeof sql>) =>
    sql<number>`coalesce(${expression}, 0)::int`;
  const [row] = await db
    .select({
      probesPerformed: n(
        sql`count(*) filter (where ${type} = 'probe_performed')`,
      ),
      probePerformedCalls: n(
        sql`sum((${payload}->>'callsMade')::int) filter (where ${type} = 'probe_performed')`,
      ),
      probesAbandoned: n(sql`count(*) filter (where ${type} = 'probe_failed')`),
      // Every attempt that reached upstream is one error on the record.
      probeAbandonedCalls: n(
        sql`sum(jsonb_array_length(${payload}->'errors')) filter (where ${type} = 'probe_failed')`,
      ),
      codeFetches: n(sql`count(*) filter (where ${type} = 'code_fetched')`),
      fetchCalls: n(
        sql`sum((${payload}->>'pageCount')::int) filter (where ${type} = 'code_fetched')`,
      ),
      requestsFetched: n(
        sql`count(distinct ${requestId}) filter (where ${type} = 'code_fetched')`,
      ),
    })
    .from(requestEvent)
    .where(
      and(
        inArray(type, ['probe_performed', 'probe_failed', 'code_fetched']),
        gte(requestEvent.occurredAt, range.start),
        lt(requestEvent.occurredAt, range.end),
      ),
    );
  return row;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export async function runTrafficReportCli(
  argv: string[],
  io: CliOutput,
  source: TrafficSource,
): Promise<number> {
  let range: InstantRange;
  let from: string;
  let to: string;
  try {
    const { values } = parseArgs({
      args: argv,
      options: { from: { type: 'string' }, to: { type: 'string' } },
      strict: true,
    });
    if (!values.from || !values.to) {
      io.err('--from and --to are both required.');
      io.err(USAGE);
      return 1;
    }
    ({ from, to } = values as { from: string; to: string });
    range = parseBangkokDateRange(from, to);
  } catch (error) {
    if (error instanceof DateRangeError || isArgumentError(error)) {
      io.err(error.message);
      io.err(USAGE);
      return 1;
    }
    throw error;
  }

  const t = await source.count(range);
  const probeCalls = t.probePerformedCalls + t.probeAbandonedCalls;
  io.out(`Upstream traffic, ${from} to ${to} inclusive (Bangkok time)`);
  io.out('');
  io.out(`Probe calls:  ${probeCalls}`);
  io.out(
    `  ${plural(t.probesPerformed, 'Probe')} performed, ${plural(t.probePerformedCalls, 'call')} (rejected and expired Requests included)`,
  );
  io.out(
    `  ${plural(t.probesAbandoned, 'Probe')} abandoned, ${plural(t.probeAbandonedCalls, 'call')} spent before giving up`,
  );
  io.out(`Fetch calls:  ${t.fetchCalls}`);
  io.out(
    `  ${plural(t.codeFetches, 'Report code fetch', 'Report code fetches')} for ${plural(t.requestsFetched, 'Request')}`,
  );
  io.out('');
  io.out(`Total upstream calls:  ${probeCalls + t.fetchCalls}`);
  return 0;
}
