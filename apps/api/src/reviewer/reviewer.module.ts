import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { transportConfig } from '../config/namespaces';
import { DB, type Db } from '../db/database.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { CLOCK, type Clock, systemClock } from './clock';
import { LoginThrottle } from './login-throttle';
import { CsrfGuard } from './csrf.guard';
import { DecisionsController } from './decisions.controller';
import { Decisions } from './decisions.service';
import { ReviewerAuth } from './reviewer-auth';
import { ReviewerAuthGuard } from './reviewer-auth.guard';
import { REVIEWER_CONFIG, reviewerConfigFrom } from './reviewer-config';
import { HOLIDAYS, ReviewQueue } from './review-queue.service';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewerController } from './reviewer.controller';
import { ReviewerSessions } from './reviewer-sessions';
import { THAI_HOLIDAYS_SET } from './thai-holidays';

@Module({
  imports: [ReferenceDataModule, ExtractionModule],
  controllers: [ReviewerController, ReviewQueueController, DecisionsController],
  providers: [
    { provide: HOLIDAYS, useValue: THAI_HOLIDAYS_SET },
    ReviewQueue,
    Decisions,
    { provide: CLOCK, useValue: systemClock },
    {
      provide: REVIEWER_CONFIG,
      inject: [transportConfig.KEY],
      useFactory: (transport: ConfigType<typeof transportConfig>) =>
        reviewerConfigFrom(transport),
    },
    {
      provide: LoginThrottle,
      inject: [DB, CLOCK],
      useFactory: (db: Db, clock: Clock) => new LoginThrottle(db, clock),
    },
    {
      provide: ReviewerSessions,
      inject: [DB, CLOCK],
      useFactory: (db: Db, clock: Clock) => new ReviewerSessions(db, clock),
    },
    {
      provide: ReviewerAuth,
      inject: [DB, CLOCK, LoginThrottle, ReviewerSessions],
      useFactory: (
        db: Db,
        clock: Clock,
        throttle: LoginThrottle,
        sessions: ReviewerSessions,
      ) => new ReviewerAuth(db, clock, throttle, sessions),
    },
    CsrfGuard,
    ReviewerAuthGuard,
  ],
  exports: [ReviewerSessions, ReviewerAuthGuard, CLOCK, ReviewerAuth],
})
export class ReviewerModule {}
