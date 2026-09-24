import { describe, expect, it } from 'vitest';
import { diskHealth, diskStatus } from './disk-health';

const GB = 1024 ** 3;
const used = (fraction: number) => ({
  totalBytes: 100 * GB,
  availableBytes: (1 - fraction) * 100 * GB,
});

describe('diskStatus', () => {
  it('is ok below 75% used', () => {
    expect(diskStatus(used(0.749))).toEqual({ status: 'ok' });
  });

  it('warns from 75% used', () => {
    expect(diskStatus(used(0.75))).toMatchObject({ status: 'warn' });
  });

  it('is degraded from 90% used', () => {
    expect(diskStatus(used(0.9))).toMatchObject({ status: 'degraded' });
  });

  it('counts space reserved for root as used, as `df` does', () => {
    // 100 GB volume, 80 GB genuinely used, 5 GB reserved: 85 of the 100 GB
    // are unavailable to the app.
    expect(
      diskStatus({ totalBytes: 100 * GB, availableBytes: 15 * GB }),
    ).toMatchObject({ status: 'warn' });
  });

  it('never carries a figure in its reason: the document is statuses only', () => {
    const health = diskStatus(used(0.93));
    expect(JSON.stringify(health)).not.toMatch(/9[0-9]|\d+ ?%/);
  });
});

describe('diskHealth', () => {
  it('measures the volume holding the path, not anything the service wrote', async () => {
    const seen: string[] = [];
    const health = await diskHealth('/scratch', (path) => {
      seen.push(path);
      return Promise.resolve(used(0.95));
    });
    expect(seen).toEqual(['/scratch']);
    expect(health.status).toBe('degraded');
  });

  it('is degraded, not a crash, when the volume cannot be read', async () => {
    const health = await diskHealth('/scratch', () =>
      Promise.reject(new Error('ENOENT')),
    );
    expect(health.status).toBe('degraded');
  });
});
