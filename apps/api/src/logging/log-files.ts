import { appendFileSync, mkdirSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Application logs are kept for 72 hours, then deleted — the same clock as
 * the Extract (spec §14.5). **The clock is the backstop, not the control**:
 * the control is that no case data ever reaches a log line. Nobody should
 * read the matching numbers as the reason this is safe.
 */
export const LOG_RETENTION_MS = 72 * 60 * 60 * 1000;

const HOUR_FILE = /^app-(\d{4})(\d{2})(\d{2})(\d{2})\.log$/;

/** One file per UTC hour, so expiry is deleting whole files. */
export function logFileName(at: Date): string {
  const iso = at.toISOString(); // 2026-09-24T10:30:00.000Z
  return `app-${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}.log`;
}

function hourOf(name: string): number | null {
  const m = HOUR_FILE.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) : null;
}

/**
 * Deletes each hour file whose first line is 72 hours old, so no line
 * outlives the Extract it might describe. Hour files make the edge coarse:
 * a line lives between 71 and 72 hours — deliberately the short side — plus
 * the up-to-60-second wait for the pass that deletes it, the same slack the
 * Extract's own deletion has. Only this module's own file names
 * are touched. A directory that does not exist holds nothing to delete.
 */
export async function pruneLogFiles(dir: string, now: Date): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const cutoff = now.getTime() - LOG_RETENTION_MS;
  let deleted = 0;
  for (const name of names) {
    const hour = hourOf(name);
    if (hour === null || hour > cutoff) continue;
    await unlink(join(dir, name));
    deleted += 1;
  }
  return deleted;
}

/**
 * Copies everything the process writes to `streams` into the current hour's
 * file under `dir`, then passes it through unchanged. Installed on stdout and
 * stderr before anything else runs, so it catches Nest's logger, BullMQ and a
 * stray `console.error` alike — and Compose then discards the stream copy
 * (`logging: driver: none`), leaving these files as the only log, the one the
 * tick expires. Synchronous on purpose: this service logs a few lines a
 * minute, and a line lost to a crash is worse than a blocked microsecond.
 */
export function teeToLogFiles(
  dir: string,
  streams: NodeJS.WriteStream[] = [process.stdout, process.stderr],
  now: () => Date = () => new Date(),
): void {
  mkdirSync(dir, { recursive: true });
  for (const stream of streams) {
    const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;
    stream.write = (chunk: string | Uint8Array, ...rest: unknown[]) => {
      try {
        appendFileSync(join(dir, logFileName(now())), chunk);
      } catch {
        // A full or unwritable log volume must not take the service down:
        // `/health`'s disk component is what reports it.
      }
      return write(chunk, ...rest);
    };
  }
}
