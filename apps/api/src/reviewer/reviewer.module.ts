import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { transportConfig } from '../config/namespaces';
import { DB, type Db } from '../db/database.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { MailModule } from '../mail/mail.module';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { CLOCK, type Clock } from '../clock/clock';
import { AlertsController } from './alerts.controller';
import { Alerts } from './alerts.service';
import { LoginThrottle } from './login-throttle';
import { CsrfGuard } from './csrf.guard';
import { DecisionsController } from './decisions.controller';
import { InFlightController } from './in-flight.controller';
import { InFlight } from './in-flight.service';
import { Decisions } from './decisions.service';
import { ReviewerAuth } from './reviewer-auth';
import { ReviewerAuthGuard } from './reviewer-auth.guard';
import { REVIEWER_CONFIG, reviewerConfigFrom } from './reviewer-config';
import { ReviewQueue } from './review-queue.service';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewerController } from './reviewer.controller';
import { ReviewerSessions } from './reviewer-sessions';

@Module({
  imports: [ReferenceDataModule, ExtractionModule, MailModule],
  controllers: [
    ReviewerController,
    ReviewQueueController,
    DecisionsController,
    AlertsController,
    InFlightController,
  ],
  providers: [
    ReviewQueue,
    Decisions,
    Alerts,
    InFlight,
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
  exports: [ReviewerSessions, ReviewerAuthGuard, ReviewerAuth, LoginThrottle],
})
export class ReviewerModule {}
