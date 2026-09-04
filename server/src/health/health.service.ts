import { Injectable } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { AppConfigService } from '../config/app-config.service.js';
import type { ComponentHealth, HealthDocument } from './health.types.js';

const DISK_WARN_PERCENT = 75;
const DISK_UNHEALTHY_PERCENT = 90;

@Injectable()
export class HealthService {
  constructor(private readonly config: AppConfigService) {}

  async check(): Promise<HealthDocument> {
    const components = {
      scheduler: { status: 'healthy' } as ComponentHealth,
      extraction: { status: 'healthy' } as ComponentHealth,
      disk: await this.checkDisk(),
      mail: { status: 'healthy' } as ComponentHealth,
    };

    const statuses = Object.values(components).map((c) => c.status);
    const status = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('warn')
        ? 'warn'
        : 'healthy';

    return { status, components };
  }

  private async checkDisk(): Promise<ComponentHealth> {
    const { blocks, bfree } = await statfs(this.config.diskCheckPath);
    const usedPercent = ((blocks - bfree) / blocks) * 100;
    const status =
      usedPercent >= DISK_UNHEALTHY_PERCENT
        ? 'unhealthy'
        : usedPercent >= DISK_WARN_PERCENT
          ? 'warn'
          : 'healthy';
    return { status, detail: `${usedPercent.toFixed(1)}% used` };
  }
}
