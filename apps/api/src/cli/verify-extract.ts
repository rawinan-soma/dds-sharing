import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hostCliSchema, validateEnvOrExit } from '../config/env.schema';
import { runMain, terminalOutput } from './cli-io';
import { findReleases, runVerifyExtractCli } from './verify-extract-cli';

// `docker compose exec app node dist/cli/verify-extract.js <file>`
//
// The file must be inside the container first (`docker compose cp`). Reads the
// record as the application role; it writes nothing.

async function main(): Promise<number> {
  const { APP_DATABASE_URL: connectionString } =
    validateEnvOrExit(hostCliSchema);
  const pool = new Pool({ connectionString });
  try {
    const db = drizzle(pool);
    return await runVerifyExtractCli(process.argv.slice(2), terminalOutput, {
      readFile: (path) => readFile(path),
      findReleases: (sha) => findReleases(db, sha),
    });
  } finally {
    await pool.end();
  }
}

runMain(main);
