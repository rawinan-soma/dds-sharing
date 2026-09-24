import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hostCliSchema, validateEnvOrExit } from '../config/env.schema';
import { runMain, terminalOutput } from './cli-io';
import {
  countUpstreamTraffic,
  runTrafficReportCli,
} from './traffic-report-cli';

// `docker compose exec app node dist/cli/traffic-report.js --from <day> --to <day>`
//
// Reads the record as the application role; it writes nothing.

async function main(): Promise<number> {
  const { APP_DATABASE_URL: connectionString } =
    validateEnvOrExit(hostCliSchema);
  const pool = new Pool({ connectionString });
  try {
    const db = drizzle(pool);
    return await runTrafficReportCli(process.argv.slice(2), terminalOutput, {
      count: (range) => countUpstreamTraffic(db, range),
    });
  } finally {
    await pool.end();
  }
}

runMain(main);
