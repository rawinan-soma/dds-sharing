import { describe, expect, it, vi } from 'vitest';
import type { DiskHealthService } from './disk-health.service.js';
import { HealthService } from './health.service.js';
import type { ComponentHealth } from './health.types.js';

function diskStub(disk: ComponentHealth): DiskHealthService {
  return { check: vi.fn().mockResolvedValue(disk) } as unknown as DiskHealthService;
}

describe('HealthService', () => {
  it('reports healthy overall when disk is healthy', async () => {
    const service = new HealthService(diskStub({ status: 'healthy', usedPercent: 10 }));

    const document = await service.check();

    expect(document.status).toBe('healthy');
    expect(document.components.scheduler).toEqual({ status: 'healthy' });
    expect(document.components.extraction).toEqual({ status: 'healthy' });
    expect(document.components.mail).toEqual({ status: 'healthy' });
  });

  it('stays healthy overall when disk is only warning', async () => {
    const service = new HealthService(diskStub({ status: 'warn', usedPercent: 80 }));

    const document = await service.check();

    expect(document.status).toBe('healthy');
    expect(document.components.disk.status).toBe('warn');
  });

  it('flips overall to unhealthy when disk is unhealthy', async () => {
    const service = new HealthService(diskStub({ status: 'unhealthy', usedPercent: 95 }));

    const document = await service.check();

    expect(document.status).toBe('unhealthy');
  });
});
