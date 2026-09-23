import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// "One pass … there is no second schedule anywhere" (spec §15.3). The tick is
// the only timer that finds work; a schedule added anywhere else — a cron, a
// BullMQ repeatable job or backoff, a second interval — is a second way to be
// half-alive, and one a Redis loss can silently cancel. This reads the source,
// because a schedule that is never started in a test is still a schedule.

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

const FILES = sources(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

const where = (pattern: RegExp) =>
  FILES.filter((f) => pattern.test(f.text)).map((f) => f.path);

describe('the one schedule (§15.3)', () => {
  it('registers exactly one interval, the tick’s, and nothing else sets one', () => {
    expect(where(/\baddInterval\(/)).toEqual(['scheduler/scheduler.module.ts']);
    expect(where(/\bsetInterval\(/)).toEqual(['scheduler/scheduler.module.ts']);
  });

  it('declares no cron, decorator schedule or timeout job', () => {
    expect(where(/@(Cron|Interval|Timeout)\(/)).toEqual([]);
    expect(where(/\b(addCronJob|addTimeout|CronJob)\b/)).toEqual([]);
  });

  it('gives BullMQ no schedule of its own: no repeatable job and no retry backoff', () => {
    expect(where(/\brepeat\s*:|\bupsertJobScheduler\(|\bbackoff\s*:/)).toEqual(
      [],
    );
  });
});
