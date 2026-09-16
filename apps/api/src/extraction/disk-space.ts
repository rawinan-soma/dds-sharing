import { mkdir, statfs } from "node:fs/promises";

/**
 * The fixed free-disk floor a job refuses to start below (spec §7.8, §13.5).
 * A **floor**, not a projection from the Probe's row count — the volume
 * also carries PostgreSQL, logs and container images, so a projection off
 * the Extract's own size (tens of KB) would be arithmetic on a number that
 * is always effectively zero.
 */
export const MIN_FREE_DISK_BYTES = 1 * 1024 * 1024 * 1024;

export interface FreeDiskCheck {
  freeBytes: number;
  belowFloor: boolean;
}

/**
 * Checks free space on the filesystem holding `path` — the same volume the
 * job's scratch checkpoints write to, which is the volume §7.8 means (it
 * also carries PostgreSQL, logs and container images, so checking anywhere
 * else would answer the wrong question). Creates `path` if it does not yet
 * exist, since `statfs` needs a real directory to inspect.
 */
export async function checkFreeDisk(
  path: string,
  floorBytes: number = MIN_FREE_DISK_BYTES,
): Promise<FreeDiskCheck> {
  await mkdir(path, { recursive: true });
  const stats = await statfs(path);
  const freeBytes = stats.bavail * stats.bsize;
  return { freeBytes, belowFloor: freeBytes < floorBytes };
}
