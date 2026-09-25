import { parseArgs } from 'node:util';
import { and, gte, inArray, lt, type SQL, sql } from 'drizzle-orm';
import { type Db } from '../db/database.module';
import { requestEvent } from '../db/schema';
import { type CliOutput, isArgumentError, plural } from './host-command';
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

type TrafficEvent = 'probe_performed' | 'probe_failed' | 'code_fetched';
const TRAFFIC_EVENTS: TrafficEvent[] = [
  'probe_performed',
  'probe_failed',
  'code_fetched',
];

export async function countUpstreamTraffic(
  db: Db,
  range: InstantRange,
): Promise<UpstreamTraffic> {
  const { type, payload, requestId } = requestEvent;
  // An aggregate over one event type's rows, zero when there were none.
  const over = (event: TrafficEvent, aggregate: SQL) =>
    sql<number>`coalesce(${aggregate} filter (where ${type} = ${event}), 0)::int`;
  const [row] = await db
    .select({
      probesPerformed: over('probe_performed', sql`count(*)`),
      probePerformedCalls: over(
        'probe_performed',
        sql`sum((${payload}->>'callsMade')::int)`,
      ),
      probesAbandoned: over('probe_failed', sql`count(*)`),
      // One relayed error per attempt (probe.service.ts); #99 has where that
      // and upstream's own count part ways.
      probeAbandonedCalls: over(
        'probe_failed',
        sql`sum(jsonb_array_length(${payload}->'errors'))`,
      ),
      codeFetches: over('code_fetched', sql`count(*)`),
      fetchCalls: over(
        'code_fetched',
        sql`sum((${payload}->>'pageCount')::int)`,
      ),
      requestsFetched: over('code_fetched', sql`count(distinct ${requestId})`),
    })
    .from(requestEvent)
    .where(
      and(
        inArray(type, TRAFFIC_EVENTS),
        gte(requestEvent.occurredAt, range.start),
        lt(requestEvent.occurredAt, range.end),
      ),
    );
  return row;
}

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

  const traffic = await source.count(range);
  const probeCalls = traffic.probePerformedCalls + traffic.probeAbandonedCalls;
  io.out(`Upstream traffic, ${from} to ${to} inclusive (Bangkok time)`);
  io.out('');
  io.out(`Probe calls:  ${probeCalls}`);
  io.out(
    `  ${plural(traffic.probesPerformed, 'Probe')} performed, ${plural(traffic.probePerformedCalls, 'call')} (rejected and expired Requests included)`,
  );
  io.out(
    `  ${plural(traffic.probesAbandoned, 'Probe')} abandoned, ${plural(traffic.probeAbandonedCalls, 'call')} spent before giving up`,
  );
  io.out(`Fetch calls:  ${traffic.fetchCalls}`);
  io.out(
    `  ${plural(traffic.codeFetches, 'Report code fetch', 'Report code fetches')} for ${plural(traffic.requestsFetched, 'Request')}`,
  );
  io.out('');
  io.out(`Total upstream calls:  ${probeCalls + traffic.fetchCalls}`);
  io.out('');
  io.out(
    "Approximate: counted from the record, which misses retries that ended in success, an abandoned Probe's earlier codes and a failed job's pages, and counts a Probe error raised before a call left the host. See #99.",
  );
  return 0;
}
