import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { runMigrations } from './db/migrate.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfigService);

  await runMigrations(config.databaseUrl);

  // dotfiles: 'allow' — see the comment in spa.controller.ts.
  app.useStaticAssets(config.staticRoot, { index: false, dotfiles: 'allow' });

  await app.listen(config.port);
}
await bootstrap();
