import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    return this.respond(res);
  }

  // Kept as an alias — nothing scheduler-specific lands here until the scheduler slice does.
  @Get('scheduler')
  async healthScheduler(@Res({ passthrough: true }) res: Response) {
    return this.respond(res);
  }

  private async respond(res: Response) {
    const document = await this.healthService.check();
    res.status(document.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return document;
  }
}
