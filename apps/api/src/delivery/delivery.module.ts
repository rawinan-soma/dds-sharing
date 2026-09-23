import { Module } from '@nestjs/common';
import {
  ARCHIVE_STORE,
  ExtractionModule,
} from '../extraction/extraction.module';
import { type ArchiveStore } from '../extraction/archive-store';
import { DB, type Db } from '../db/database.module';
import {
  DeliveryController,
  LinkExpiredController,
} from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DownloadThrottle } from './download-throttle';
import { DownloadTokens } from './download-tokens.repository';
import { DownloadTokensModule } from './download-tokens.module';

@Module({
  imports: [ExtractionModule, DownloadTokensModule],
  controllers: [DeliveryController, LinkExpiredController],
  providers: [
    {
      provide: DownloadThrottle,
      inject: [DB],
      useFactory: (db: Db) => new DownloadThrottle(db),
    },
    {
      provide: DeliveryService,
      inject: [DB, DownloadTokens, DownloadThrottle, ARCHIVE_STORE],
      useFactory: (
        db: Db,
        downloadTokens: DownloadTokens,
        throttle: DownloadThrottle,
        archiveStore: ArchiveStore,
      ) => new DeliveryService(db, downloadTokens, throttle, archiveStore),
    },
  ],
})
export class DeliveryModule {}
