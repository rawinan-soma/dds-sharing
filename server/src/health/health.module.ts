import { Module } from '@nestjs/common';
import { DiskHealthService } from './disk-health.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService, DiskHealthService],
})
export class HealthModule {}
