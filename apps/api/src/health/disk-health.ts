import { statfs } from 'node:fs/promises';
import { type ComponentHealth } from './component-health';

export type DiskHealth = ComponentHealth;

/** Spec §13.5: warn at 75%, unhealthy at 90%. */
export const DISK_WARN_USED = 0.75;
export const DISK_DEGRADED_USED = 0.9;

export interface VolumeUsage {
  totalBytes: number;
  /** What an unprivileged process can still write — `df`'s "Avail". */
  availableBytes: number;
}

/** Measures the volume holding a path: `volumeUsage` in the app, a stand-in
 * in a spec. */
export type MeasureVolume = (path: string) => Promise<VolumeUsage>;

/**
 * The `disk` component (spec §13.5, §14.1). It watches the *volume*, never
 * the Extract figure, which will not fill anything. The scratch volume stands
 * for the whole disk because Docker keeps every named volume — PostgreSQL's,
 * the logs', MinIO's — and the images on one filesystem (docker-compose.yml).
 * The responder is the service owner with shell access, never a Reviewer, so
 * nothing here reaches the queue. The reason names the threshold crossed,
 * never the figure: `/health` is statuses only.
 */
export function diskStatus(usage: VolumeUsage): DiskHealth {
  const used = 1 - usage.availableBytes / usage.totalBytes;
  if (used >= DISK_DEGRADED_USED) {
    return { status: 'degraded', reason: 'the volume is nearly full' };
  }
  if (used >= DISK_WARN_USED) {
    return { status: 'warn', reason: 'the volume is filling' };
  }
  return { status: 'ok' };
}

export async function volumeUsage(path: string): Promise<VolumeUsage> {
  const stats = await statfs(path);
  return {
    totalBytes: stats.blocks * stats.bsize,
    availableBytes: stats.bavail * stats.bsize,
  };
}

/** A volume that cannot be read is not a healthy one. */
export async function diskHealth(
  path: string,
  measure: MeasureVolume,
): Promise<DiskHealth> {
  try {
    return diskStatus(await measure(path));
  } catch {
    return { status: 'degraded', reason: 'the volume could not be read' };
  }
}
