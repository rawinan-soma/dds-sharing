import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from '../../test/support/source-files';

// "One pass … there is no second schedule anywhere" (spec §15.3). The tick is
// the only timer that finds work; a schedule added anywhere else — a cron, a
// BullMQ repeatable or delayed job, a retry backoff, a second interval, a
// timer loop — is a second way to be half-alive, and a schedule held only in
// Redis is one a Redis loss silently cancels. This reads the source, because a
// schedule nobody starts in a test is still a schedule. A tripwire, not a
// proof: each exception below is argued for here, so the next has to be too.

const SRC = join(__dirname, '..');
const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

const where = (pattern: RegExp) =>
  FILES.filter((f) => pattern.test(f.text)).map((f) => f.path);

// One-shot timers, none of which finds or schedules work: a timeout on a
// MinIO call, the stall guard's re-arm, and the two in-job retry sleeps.
const ONE_SHOT_TIMERS = [
  'extraction/extraction-worker.ts',
  'extraction/stall-guard.ts',
  'scheduler/with-timeout.ts',
  'upstream/upstream-client.ts',
];

describe('the one schedule (§15.3)', () => {
  it('registers exactly one interval, the tick’s, and nothing else sets one', () => {
    expect(where(/\baddInterval\(/)).toEqual(['scheduler/scheduler.module.ts']);
    expect(where(/\bsetInterval\(/)).toEqual(['scheduler/scheduler.module.ts']);
  });

  it('declares no cron, decorator schedule or timeout job', () => {
    expect(where(/@(Cron|Interval|Timeout)\(/)).toEqual([]);
    expect(where(/\b(addCronJob|addTimeout|CronJob)\b/)).toEqual([]);
  });

  it('uses setTimeout only for the argued-for one-shot timers', () => {
    expect(where(/\bsetTimeout\(/).sort()).toEqual(ONE_SHOT_TIMERS);
  });

  it('gives BullMQ no schedule of its own: no repeatable or delayed job, no retry backoff', () => {
    expect(
      where(/\brepeat\s*:|\bupsertJobScheduler\(|\bbackoff\s*:|\bdelay\s*:/),
    ).toEqual([]);
  });

  it('delays a job in Redis only where Postgres still holds it as unfinished', () => {
    // The low-disk recheck (§7.8): the row stays `queued`, so a Redis loss
    // leaves a job the tick's reconcile re-enqueues — never a lost schedule.
    expect(where(/\bmoveToDelayed\(/)).toEqual([
      'extraction/extraction-worker.ts',
    ]);
  });

  it('starts the tick from main.ts, once the app is listening', () => {
    const main = FILES.find((f) => f.path === 'main.ts')!.text;
    const listen = main.indexOf('.listen(');
    const start = main.indexOf('.get(TickScheduler).start()');
    expect(listen).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(listen);
  });
});
