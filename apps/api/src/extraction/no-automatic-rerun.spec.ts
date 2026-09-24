import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from '../../test/support/source-files';

// "It is a button, never automatic" (spec §10.7). Code-atomic retry is already
// spent by the time a job is `failed`, so a self-retry burns another run
// against an unchanged cause and, under concurrency 1, blocks every Request
// behind it. A job row is only ever made by the two presses a human makes —
// an approval and a Re-run. The reconcile re-enqueues a row that already
// exists and never reached `failed`; it makes none. A tripwire that reads the
// source, not a proof.

const SRC = join(__dirname, '..');
const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

const where = (pattern: RegExp) =>
  FILES.filter((f) => pattern.test(f.text))
    .map((f) => f.path)
    .sort();

describe('no automatic Re-run (§10.7)', () => {
  it('makes a job row only where a Reviewer pressed approve or Re-run', () => {
    expect(where(/\binsertQueuedJob\(/)).toEqual([
      'extraction/extraction-jobs.repository.ts',
      'reviewer/decisions.service.ts',
      'reviewer/in-flight.service.ts',
    ]);
    expect(where(/\.insert\(extractionJob\)/)).toEqual([
      'extraction/extraction-jobs.repository.ts',
    ]);
  });

  it('writes extraction_rerun_queued only from the Reviewer-pressed Re-run', () => {
    expect(where(/type: 'extraction_rerun_queued'/)).toEqual([
      'reviewer/in-flight.service.ts',
    ]);
  });
});
