import { Module } from '@nestjs/common';
import { DB, type Db } from '../db/database.module';
import { DownloadTokens } from './download-tokens.repository';

// Split out from `delivery.module.ts` so `ExtractionModule` (which creates a
// Download token at job completion) and `DeliveryModule` (which resolves one
// at collection) can both depend on it without importing each other —
// `DeliveryModule` already needs `ExtractionModule` for `ARCHIVE_STORE`, so
// the reverse import would be circular.
@Module({
  providers: [
    {
      provide: DownloadTokens,
      inject: [DB],
      useFactory: (db: Db) => new DownloadTokens(db),
    },
  ],
  exports: [DownloadTokens],
})
export class DownloadTokensModule {}
