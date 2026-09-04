import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import configuration from './config/configuration.js';
import { HealthModule } from './health/health.module.js';

// Routes NestJS never serves statically (docs/adr/0003, docs/spec.md §16.2):
// the API prefix, the health document and the fixed download path.
const STATIC_EXCLUDE = ['/api/{*splat}', '/health', '/health/scheduler', '/d/{*splat}'];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(dirname(fileURLToPath(import.meta.url)), '..', 'public'),
      exclude: STATIC_EXCLUDE,
    }),
    HealthModule,
  ],
})
export class AppModule {}
