import { readFile } from 'node:fs/promises';
import { runMain, terminalOutput, withAppDb } from './host-command';
import { findReleases, runVerifyExtractCli } from './verify-extract-cli';

// `docker compose exec app node dist/cli/verify-extract.js <file>`
//
// The file must be inside the container first (`docker compose cp`). Reads the
// record; it writes nothing.

runMain(() =>
  withAppDb((db) =>
    runVerifyExtractCli(process.argv.slice(2), terminalOutput, {
      readFile: (path) => readFile(path),
      findReleases: (checksum) => findReleases(db, checksum),
    }),
  ),
);
