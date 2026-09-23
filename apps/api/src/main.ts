import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import { appConfig } from './config/namespaces';
import { API_PREFIX, API_PREFIX_EXCLUDE } from './global-prefix';

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
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
