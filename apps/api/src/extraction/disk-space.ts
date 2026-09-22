import { statfs } from 'node:fs/promises';

/**
 * Free bytes on the volume holding `path` (spec §7.8). A plain function, not
 * a class: there is no state to hold between calls, only a seam a test can
 * replace.
 */
export async function freeDiskBytes(path: string): Promise<number> {
  const stats = await statfs(path);
  return stats.bavail * stats.bsize;
}
