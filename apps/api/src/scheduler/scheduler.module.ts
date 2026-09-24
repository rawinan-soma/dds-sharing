import {
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { type Pool } from 'pg';
import { appConfig } from '../config/namespaces';
import { DB, PG_POOL, type Db } from '../db/database.module';
import { type ArchiveStore } from '../extraction/archive-store';
import {
  ARCHIVE_STORE,
  ExtractionModule,
} from '../extraction/extraction.module';
import { ExtractionJobs } from '../extraction/extraction-jobs.repository';
import { ExtractionQueue } from '../extraction/extraction-queue';
import { MailDeliveries } from '../mail/mail-delivery.repository';
import { MailModule } from '../mail/mail.module';
import { MailQueue } from '../mail/mail-queue';
import { CLOCK, type Clock } from '../clock/clock';
import { LoginThrottle } from '../reviewer/login-throttle';
import { ReviewerModule } from '../reviewer/reviewer.module';
import { ReviewerSessions } from '../reviewer/reviewer-sessions';
import { Tick, type TickMode } from './tick';

/** Every 60 seconds (spec §15.3). One schedule: there is no second one anywhere. */
export const TICK_INTERVAL_MS = 60_000;
const INTERVAL_NAME = 'tick';

/**
 * Starts the tick: the startup reconcile first, then the 60-second pass.
 * Started explicitly from `main.ts` rather than on module init, so a test that
 * boots the app drives the pass itself instead of racing a timer.
 */
@Injectable()
export class TickScheduler implements OnApplicationShutdown {
  private readonly logger = new Logger('TickScheduler');

  constructor(
    private readonly tick: Tick,
    private readonly registry: SchedulerRegistry,
  ) {}

  async start(): Promise<void> {
    await this.run('startup');
    this.registry.addInterval(
      INTERVAL_NAME,
      setInterval(() => void this.run('regular'), TICK_INTERVAL_MS),
    );
  }

  onApplicationShutdown() {
    if (this.registry.doesExist('interval', INTERVAL_NAME)) {
      this.registry.deleteInterval(INTERVAL_NAME);
    }
  }

  // A pass that throws must not take the process down: the next one is the
  // retry, and a tick that stays down is what the heartbeat is for.
  private async run(mode: TickMode): Promise<void> {
    try {
      await this.tick.runPass(mode);
    } catch (error) {
      this.logger.error(`tick pass failed: ${(error as Error).message}`);
    }
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ExtractionModule,
    MailModule,
    ReviewerModule,
  ],
  providers: [
    {
      provide: Tick,
      inject: [
        DB,
        PG_POOL,
        CLOCK,
        ARCHIVE_STORE,
        ExtractionJobs,
        ExtractionQueue,
        MailQueue,
        MailDeliveries,
        ReviewerSessions,
        LoginThrottle,
        appConfig.KEY,
      ],
      useFactory: (
        db: Db,
        pool: Pool,
        clock: Clock,
        archiveStore: ArchiveStore,
        extractionJobs: ExtractionJobs,
        extractionQueue: ExtractionQueue,
        mailQueue: MailQueue,
        mailDeliveries: MailDeliveries,
        sessions: ReviewerSessions,
        loginThrottle: LoginThrottle,
        app: ConfigType<typeof appConfig>,
      ) =>
        new Tick({
          db,
          pool,
          clock,
          archiveStore,
          extractionJobs,
          extractionQueue,
          mailQueue,
          mailDeliveries,
          sessions,
          loginThrottle,
          logDir: app.logDir,
        }),
    },
    TickScheduler,
  ],
  exports: [Tick, TickScheduler],
})
export class SchedulerModule {}
