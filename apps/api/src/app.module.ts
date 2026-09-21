import { isAbsolute, join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { ReferenceDataModule } from './reference/reference-data.module';
import { ReviewerModule } from './reviewer/reviewer.module';
import { keepReviewerSurfaceOutOfSearch } from './reviewer/noindex';

// A request under the API prefix must never fall through to the SPA shell.
const API_PREFIX_EXCLUDE = /^\/api(\/.*)?$/;

// Relative to the working directory unless absolute.
const staticRoot = (root: string) =>
  isAbsolute(root) ? root : join(process.cwd(), root);

@Module({
  imports: [
    ServeStaticModule.forRootAsync({
      useFactory: () => [
        {
          rootPath: staticRoot(process.env.STATIC_ROOT ?? 'public'),
          exclude: API_PREFIX_EXCLUDE,
          serveStaticOptions: { setHeaders: keepReviewerSurfaceOutOfSearch },
        },
      ],
    }),
    DatabaseModule,
    ReferenceDataModule,
    HealthModule,
    ReviewerModule,
  ],
})
export class AppModule {}
