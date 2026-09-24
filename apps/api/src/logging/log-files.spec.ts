import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOG_RETENTION_MS,
  logFileName,
  pruneLogFiles,
  teeToLogFiles,
} from './log-files';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-24T10:30:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'log-files-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('logFileName', () => {
  it('names one file per UTC hour', () => {
    expect(logFileName(new Date('2026-09-24T10:00:00Z'))).toBe(
      'app-2026092410.log',
    );
    expect(logFileName(new Date('2026-09-24T10:59:59Z'))).toBe(
      'app-2026092410.log',
    );
  });
});

describe('pruneLogFiles', () => {
  it('keeps logs for 72 hours — the same clock as the Extract (§14.5)', () => {
    expect(LOG_RETENTION_MS).toBe(72 * HOUR);
  });

  it('deletes an hour file once its first line is 72 hours old, and keeps the rest', async () => {
    const expired = logFileName(ago(72 * HOUR)); // 07:00 three days ago
    const olderStill = logFileName(ago(100 * HOUR));
    const kept = logFileName(ago(71 * HOUR));
    const current = logFileName(NOW);
    for (const name of [expired, olderStill, kept, current]) {
      await writeFile(join(dir, name), 'line\n');
    }

    expect(await pruneLogFiles(dir, NOW)).toBe(2);
    expect((await readdir(dir)).sort()).toEqual([kept, current].sort());
  });

  it('leaves anything that is not one of its own hour files alone', async () => {
    await writeFile(join(dir, 'notes.txt'), 'operator notes');

    expect(await pruneLogFiles(dir, NOW)).toBe(0);
    expect(await readdir(dir)).toEqual(['notes.txt']);
  });

  it('prunes nothing, and does not fail, when the directory does not exist', async () => {
    expect(await pruneLogFiles(join(dir, 'missing'), NOW)).toBe(0);
  });
});

describe('teeToLogFiles', () => {
  it('appends everything written to the stream into the current hour file, and still passes it through', async () => {
    const passedThrough: string[] = [];
    const stream = {
      write: (chunk: string | Uint8Array) => {
        passedThrough.push(String(chunk));
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    let now = new Date('2026-09-24T10:59:00Z');

    teeToLogFiles(join(dir, 'logs'), [stream], () => now);
    stream.write('first\n');
    now = new Date('2026-09-24T11:00:00Z');
    stream.write(Buffer.from('second\n'));

    expect(passedThrough).toEqual(['first\n', 'second\n']);
    expect(
      await readFile(join(dir, 'logs', 'app-2026092410.log'), 'utf8'),
    ).toBe('first\n');
    expect(
      await readFile(join(dir, 'logs', 'app-2026092411.log'), 'utf8'),
    ).toBe('second\n');
  });
});
