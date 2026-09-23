import { isAbsolute, join } from 'node:path';
import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppConfigModule } from './config/app-config.module';
import { appConfig } from './config/namespaces';
import { DatabaseModule } from './db/database.module';
import { DeliveryModule } from './delivery/delivery.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { ReferenceDataModule } from './reference/reference-data.module';
import { RequestsModule } from './requests/requests.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ReviewerModule } from './reviewer/reviewer.module';
import { keepReviewerSurfaceOutOfSearch } from './reviewer/noindex';

// A request under the API prefix must never fall through to the SPA shell.
const API_PREFIX_EXCLUDE = /^\/api(\/.*)?$/;

// Relative to the working directory unless absolute.
const staticRoot = (root: string) =>
  isAbsolute(root) ? root : join(process.cwd(), root);

@Module({
  imports: [
    AppConfigModule,
    ServeStaticModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (app: ConfigType<typeof appConfig>) => [
        {
          rootPath: staticRoot(app.staticRoot),
          exclude: API_PREFIX_EXCLUDE,
          serveStaticOptions: { setHeaders: keepReviewerSurfaceOutOfSearch },
        },
      ],
    }),
    DatabaseModule,
    ReferenceDataModule,
    HealthModule,
    RequestsModule,
    ReviewerModule,
    MailModule,
    DeliveryModule,
    SchedulerModule,
  ],
})
export class AppModule {}
