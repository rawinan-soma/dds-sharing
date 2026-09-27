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
// jobs, and `job_failed` the calls a failed job spent on a code it did not
// finish. Each carries `callsMade`: every call that reached upstream, retries
// included, and none that failed before it left the host (upstream-client.ts).

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
  jobsFailed: number;
  failedJobCalls: number;
}

export interface TrafficSource {
  count(range: InstantRange): Promise<UpstreamTraffic>;
}

type TrafficEvent =
  'probe_performed' | 'probe_failed' | 'code_fetched' | 'job_failed';
const TRAFFIC_EVENTS: TrafficEvent[] = [
  'probe_performed',
  'probe_failed',
  'code_fetched',
  'job_failed',
];

export async function countUpstreamTraffic(
  db: Db,
  range: InstantRange,
): Promise<UpstreamTraffic> {
  const { type, payload, requestId } = requestEvent;
  // An aggregate over one event type's rows, zero when there were none.
  const over = (event: TrafficEvent, aggregate: SQL) =>
    sql<number>`coalesce(${aggregate} filter (where ${type} = ${event}), 0)::int`;
  const callsMadeSum = sql`sum((${payload}->>'callsMade')::int)`;
  const [row] = await db
    .select({
      probesPerformed: over('probe_performed', sql`count(*)`),
      probePerformedCalls: over('probe_performed', callsMadeSum),
      probesAbandoned: over('probe_failed', sql`count(*)`),
      probeAbandonedCalls: over('probe_failed', callsMadeSum),
      codeFetches: over('code_fetched', sql`count(*)`),
      fetchCalls: over('code_fetched', callsMadeSum),
      requestsFetched: over('code_fetched', sql`count(distinct ${requestId})`),
      jobsFailed: over('job_failed', sql`count(*)`),
      failedJobCalls: over('job_failed', callsMadeSum),
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
  const fetchCalls = traffic.fetchCalls + traffic.failedJobCalls;
  io.out(`Upstream traffic, ${from} to ${to} inclusive (Bangkok time)`);
  io.out('');
  io.out(`Probe calls:  ${probeCalls}`);
  io.out(
    `  ${plural(traffic.probesPerformed, 'Probe')} performed, ${plural(traffic.probePerformedCalls, 'call')} (rejected and expired Requests included)`,
  );
  io.out(
    `  ${plural(traffic.probesAbandoned, 'Probe')} abandoned, ${plural(traffic.probeAbandonedCalls, 'call')} spent before giving up`,
  );
  io.out(`Fetch calls:  ${fetchCalls}`);
  io.out(
    `  ${plural(traffic.codeFetches, 'Report code fetch', 'Report code fetches')} for ${plural(traffic.requestsFetched, 'Request')}, ${plural(traffic.fetchCalls, 'call')}`,
  );
  io.out(
    `  ${plural(traffic.jobsFailed, 'job')} failed, ${plural(traffic.failedJobCalls, 'call')} spent on Report codes they did not finish`,
  );
  io.out('');
  io.out(`Total upstream calls:  ${probeCalls + fetchCalls}`);
  io.out('');
  io.out(
    'Retries included. A call is counted once it reached upstream: answered, cut off while waiting, or dropped after it was sent. One that failed before it left this host is not.',
  );
  return 0;
}
