import { createInterface } from 'node:readline/promises';
import { systemClock } from '../clock/clock';
import { ReviewerAccounts } from '../reviewer/reviewer-accounts';
import { type CliIo, runMain, terminalOutput, withAppDb } from './cli-io';
import { runReviewerCli } from './reviewer-cli';
import { loadRetentionNotice } from './retention-notice';

// `docker compose exec app node dist/cli/reviewer.js <command>`
//
// Connects as the application role, like the app, so the grants in the
// migrations bind it too: it can no more delete a Reviewer or rewrite a display
// name than the running application can.

runMain(() =>
  withAppDb(async (db) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const io: CliIo = {
      ...terminalOutput,
      prompt: (question) => rl.question(question),
    };
    try {
      return await runReviewerCli(
        process.argv.slice(2),
        io,
        new ReviewerAccounts(db, systemClock),
        loadRetentionNotice(),
      );
    } finally {
      rl.close();
    }
  }),
);
