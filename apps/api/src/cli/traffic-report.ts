import { runMain, terminalOutput, withAppDb } from './host-command';
import {
  countUpstreamTraffic,
  runTrafficReportCli,
} from './traffic-report-cli';

// `docker compose exec app node dist/cli/traffic-report.js --from <day> --to <day>`
//
// Reads the record; it writes nothing.

runMain(() =>
  withAppDb((db) =>
    runTrafficReportCli(process.argv.slice(2), terminalOutput, {
      count: (range) => countUpstreamTraffic(db, range),
    }),
  ),
);
