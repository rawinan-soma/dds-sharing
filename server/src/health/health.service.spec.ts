import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppConfigService } from '../config/app-config.service.js';
import { HealthService } from './health.service.js';

vi.mock('node:fs/promises', () => ({
  statfs: vi.fn(),
}));

const { statfs } = await import('node:fs/promises');

function withUsage(usedPercent: number) {
  const blocks = 1000;
  const bfree = Math.round(blocks * (1 - usedPercent / 100));
  vi.mocked(statfs).mockResolvedValue({ blocks, bfree } as never);
}

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    process.env.BASE_URL = 'https://example.test';
    process.env.DATABASE_URL = 'postgres://example';

    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, AppConfigService],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports every placeholder component as healthy', async () => {
    withUsage(10);
    const document = await service.check();
    expect(document.components.scheduler.status).toBe('healthy');
    expect(document.components.extraction.status).toBe('healthy');
    expect(document.components.mail.status).toBe('healthy');
  });

  it('is healthy below the warn threshold', async () => {
    withUsage(74);
    const document = await service.check();
    expect(document.components.disk.status).toBe('healthy');
    expect(document.status).toBe('healthy');
  });

  it('warns at 75% used', async () => {
    withUsage(75);
    const document = await service.check();
    expect(document.components.disk.status).toBe('warn');
    expect(document.status).toBe('warn');
  });

  it('is unhealthy at 90% used', async () => {
    withUsage(90);
    const document = await service.check();
    expect(document.components.disk.status).toBe('unhealthy');
    expect(document.status).toBe('unhealthy');
  });
});
