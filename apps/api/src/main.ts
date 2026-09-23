import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import { appConfig } from './config/namespaces';
import { API_PREFIX, API_PREFIX_EXCLUDE } from './global-prefix';
import { PREPARE_EXTRACT_BUCKET } from './extraction/extraction.module';
import { TickScheduler } from './scheduler/scheduler.module';

async function bootstrap() {
  // A failed boot rejects here with the reason, rather than Nest aborting the
  // process with a core dump: the exit code below is what a supervisor sees.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
  });
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
  app.set('trust proxy', config.trustProxy);
  await app.listen(config.port);
  // The lifecycle rule is the backstop, not the control (spec §9.5): failing
  // to apply it is loud, never fatal — the tick's own deletion is the record.
  await app
    .get<() => Promise<void>>(PREPARE_EXTRACT_BUCKET)()
    .catch((error: unknown) =>
      new Logger('Bootstrap').error(
        `could not apply the Extract bucket's lifecycle backstop: ${(error as Error).message}`,
      ),
    );
  // The startup reconcile, then the 60-second pass (spec §15.3).
  await app.get(TickScheduler).start();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
