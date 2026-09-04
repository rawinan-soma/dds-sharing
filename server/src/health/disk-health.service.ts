import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { statfs } from 'node:fs/promises';
import type { AppConfig } from '../config/configuration.js';
import type { ComponentHealth } from './health.types.js';

@Injectable()
export class DiskHealthService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async check(): Promise<ComponentHealth> {
    const { path, warnPercent, unhealthyPercent } = this.configService.get('disk', {
      infer: true,
    });

    const stats = await statfs(path);
    const usedBlocks = stats.blocks - stats.bfree;
    const usedPercent = (usedBlocks / stats.blocks) * 100;

    const status =
      usedPercent >= unhealthyPercent
        ? 'unhealthy'
        : usedPercent >= warnPercent
          ? 'warn'
          : 'healthy';

    return { status, usedPercent: Math.round(usedPercent * 10) / 10 };
  }
}
