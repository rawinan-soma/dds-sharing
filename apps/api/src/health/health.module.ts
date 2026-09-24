import { Module } from '@nestjs/common';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { volumeUsage } from './disk-health';
import { HealthController } from './health.controller';
import { HealthService, VOLUME_USAGE } from './health.service';

@Module({
  imports: [ReferenceDataModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: VOLUME_USAGE, useValue: volumeUsage }],
})
export class HealthModule {}
