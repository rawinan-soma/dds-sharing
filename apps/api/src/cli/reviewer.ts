import { createInterface } from 'node:readline/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { systemClock } from '../reviewer/clock';
import { ReviewerAccounts } from '../reviewer/reviewer-accounts';
import { runReviewerCli, type CliIo } from './reviewer-cli';
import { loadRetentionNotice } from './retention-notice';

// `docker compose exec app node dist/cli/reviewer.js <command>`
//
// Connects as the application role, like the app, so the grants in the
// migrations bind it too: it can no more delete a Reviewer or rewrite a display
// name than the running application can.

async function main(): Promise<number> {
  const connectionString = process.env.APP_DATABASE_URL;
  if (!connectionString) {
    console.error('APP_DATABASE_URL must be set');
    return 1;
  }
  const pool = new Pool({ connectionString });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const io: CliIo = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    prompt: (question) => rl.question(question),
  };
  try {
    return await runReviewerCli(
      process.argv.slice(2),
      io,
      new ReviewerAccounts(drizzle(pool), systemClock),
      loadRetentionNotice(),
    );
  } finally {
    rl.close();
    await pool.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
