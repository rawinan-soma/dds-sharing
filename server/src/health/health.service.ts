import { Injectable } from '@nestjs/common';
import { DiskHealthService } from './disk-health.service.js';
import type { HealthDocument } from './health.types.js';

@Injectable()
export class HealthService {
  constructor(private readonly diskHealthService: DiskHealthService) {}

  async check(): Promise<HealthDocument> {
    const disk = await this.diskHealthService.check();

    // scheduler, extraction and mail report a healthy placeholder until their
    // owning slice lands (docs/spec.md §14.1).
    const components: HealthDocument['components'] = {
      scheduler: { status: 'healthy' },
      extraction: { status: 'healthy' },
      disk,
      mail: { status: 'healthy' },
    };

    const status = Object.values(components).some((c) => c.status === 'unhealthy')
      ? 'unhealthy'
      : 'healthy';

    return { status, components };
  }
}
