import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { ReferenceDataModule } from './reference/reference-data.module';
import { RequestsModule } from './requests/requests.module';

// A request under the API prefix must never fall through to the SPA shell.
const API_PREFIX_EXCLUDE = /^\/api(\/.*)?$/;

@Module({
  imports: [
    ServeStaticModule.forRootAsync({
      useFactory: () => [
        {
          rootPath: join(process.cwd(), process.env.STATIC_ROOT ?? 'public'),
          exclude: API_PREFIX_EXCLUDE,
        },
      ],
    }),
    DatabaseModule,
    ReferenceDataModule,
    HealthModule,
    RequestsModule,
  ],
})
export class AppModule {}
