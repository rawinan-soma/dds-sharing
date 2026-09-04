import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigModule } from './config/app-config.module.js';
import { HealthModule } from './health/health.module.js';
import { ApiModule } from './api/api.module.js';
import { SpaModule } from './spa/spa.module.js';

@Module({
  // SpaModule is last: its wildcard route only answers what HealthModule and
  // ApiModule didn't already claim.
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    HealthModule,
    ApiModule,
    SpaModule,
  ],
})
export class AppModule {}
