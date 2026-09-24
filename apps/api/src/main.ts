import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import { BullBoard } from './bull-board/bull-board';
import { httpAppSchema, validateEnvOrExit } from './config/env.schema';
import { appConfig, mapApp } from './config/namespaces';
import { teeToLogFiles } from './logging/log-files';
import { API_PREFIX, API_PREFIX_EXCLUDE } from './global-prefix';
import { TickScheduler } from './scheduler/scheduler.module';

async function bootstrap() {
  // First, so every line the process writes lands in a file the tick expires
  // after 72 hours (spec §14.5).
  teeToLogFiles(mapApp(validateEnvOrExit(httpAppSchema)).logDir);
  // A failed boot rejects here with the reason, rather than Nest aborting the
  // process with a core dump: the exit code below is what a supervisor sees.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
  });
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
  app.set('trust proxy', config.trustProxy);
  await app.listen(config.port);
  // The startup reconcile, then the 60-second pass (spec §15.3). The pass
  // also applies the MinIO lifecycle backstop, retrying until it takes.
  await app.get(TickScheduler).start();
  // Its own listener, never the public port (spec §14.4).
  await app.get(BullBoard).start();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
