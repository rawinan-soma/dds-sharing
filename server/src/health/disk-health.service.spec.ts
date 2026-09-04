import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/configuration.js';
import { DiskHealthService } from './disk-health.service.js';

vi.mock('node:fs/promises', () => ({
  statfs: vi.fn(),
}));

const { statfs } = await import('node:fs/promises');

function configServiceStub(disk: AppConfig['disk']): ConfigService<AppConfig, true> {
  return { get: () => disk } as unknown as ConfigService<AppConfig, true>;
}

const disk = { path: '/', warnPercent: 75, unhealthyPercent: 90 };

describe('DiskHealthService', () => {
  beforeEach(() => {
    vi.mocked(statfs).mockReset();
  });

  it('reports healthy below the warn threshold', async () => {
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 30 } as never); // 70% used
    const service = new DiskHealthService(configServiceStub(disk));

    await expect(service.check()).resolves.toEqual({ status: 'healthy', usedPercent: 70 });
  });

  it('reports warn at 75% used', async () => {
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 25 } as never); // 75% used
    const service = new DiskHealthService(configServiceStub(disk));

    await expect(service.check()).resolves.toEqual({ status: 'warn', usedPercent: 75 });
  });

  it('reports unhealthy at 90% used', async () => {
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 10 } as never); // 90% used
    const service = new DiskHealthService(configServiceStub(disk));

    await expect(service.check()).resolves.toEqual({ status: 'unhealthy', usedPercent: 90 });
  });
});
