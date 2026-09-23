import { Controller, Get } from '@nestjs/common';
import type { HealthDocument } from './health.service';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthDocument> {
    return this.healthService.check();
  }

  // Alias kept for the scheduler-specific health checks earlier tooling expects.
  @Get('scheduler')
  checkSchedulerAlias(): Promise<HealthDocument> {
    return this.healthService.check();
  }
}
