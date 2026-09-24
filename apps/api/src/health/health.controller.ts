import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthDocument } from './health.service';
import { HealthService } from './health.service';

/**
 * Unauthenticated on purpose (spec §14.1): an authenticated health endpoint
 * is one no external checker can watch. Non-200 whenever any component is
 * degraded; a `warn` alone stays 200, and the body says which.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(@Res({ passthrough: true }) res: Response): Promise<HealthDocument> {
    return this.respond(res);
  }

  // One surface, two paths: the alias serves the same document.
  @Get('scheduler')
  checkSchedulerAlias(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthDocument> {
    return this.respond(res);
  }

  private async respond(res: Response): Promise<HealthDocument> {
    const document = await this.healthService.check();
    res.status(
      document.status === 'degraded'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.OK,
    );
    return document;
  }
}
