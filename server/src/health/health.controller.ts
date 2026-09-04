import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

// Unauthenticated by design (docs/spec.md §14.1): DDC infra must be able to
// watch this without a credential of its own.
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const document = await this.healthService.check();
    res.status(document.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return document;
  }

  // Alias kept for existing watchers (docs/spec.md §14.1).
  @Get('scheduler')
  async checkSchedulerAlias(@Res({ passthrough: true }) res: Response) {
    return this.check(res);
  }
}
