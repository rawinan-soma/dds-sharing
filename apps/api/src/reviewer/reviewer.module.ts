import { Module } from '@nestjs/common';
import { DB, type Db } from '../db/database.module';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { CLOCK, type Clock, systemClock } from './clock';
import { LoginThrottle } from './login-throttle';
import { CsrfGuard } from './csrf.guard';
import { ReviewerAuth } from './reviewer-auth';
import { ReviewerAuthGuard } from './reviewer-auth.guard';
import { REVIEWER_CONFIG, reviewerConfigFromEnv } from './reviewer-config';
import { HOLIDAYS, ReviewQueue } from './review-queue.service';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewerController } from './reviewer.controller';
import { ReviewerSessions } from './reviewer-sessions';
import { HOLIDAYS as THAI_HOLIDAY_SET } from './thai-holidays';

@Module({
  imports: [ReferenceDataModule],
  controllers: [ReviewerController, ReviewQueueController],
  providers: [
    { provide: HOLIDAYS, useValue: THAI_HOLIDAY_SET },
    ReviewQueue,
    { provide: CLOCK, useValue: systemClock },
    {
      provide: REVIEWER_CONFIG,
      useFactory: () => reviewerConfigFromEnv(process.env),
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
