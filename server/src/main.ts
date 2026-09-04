import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/configuration.js';
import { runMigrations } from './db/migrate.js';

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }
  await runMigrations(databaseUrl);

  const app = await NestFactory.create(AppModule);

  // /health and /d/<token> are fixed, unprefixed NestJS routes (docs/adr/0003).
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/scheduler', 'd/{*splat}'],
  });

  const configService = app.get(ConfigService<AppConfig, true>);
  await app.listen(configService.get('port', { infer: true }));
}

await bootstrap();
