import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Queue } from "bullmq";
import redisConfig from "../config/redis.config.js";
import { EXTRACTION_QUEUE_NAME } from "./queue-constants.js";
import { createExtractionRedisConnection } from "./redis-connection.js";

export const EXTRACTION_QUEUE = Symbol("EXTRACTION_QUEUE");

/**
 * The producer side of §7.7's queue: BullMQ executes, but this Queue handle
 * only ever carries a Request id (§14.5 — "a BullMQ job payload carries the
 * Request id and nothing fetched"). The Worker that consumes it lives in
 * `ExtractionWorkerModule`, kept separate so a process that only enqueues
 * (e.g. a future CLI) never has to stand up a consumer.
 */
@Global()
@Module({
  providers: [
    {
      provide: EXTRACTION_QUEUE,
      useFactory: (config: ConfigType<typeof redisConfig>): Queue =>
        new Queue(EXTRACTION_QUEUE_NAME, {
          connection: createExtractionRedisConnection(config.url),
        }),
      inject: [redisConfig.KEY],
    },
  ],
  exports: [EXTRACTION_QUEUE],
})
export class ExtractionQueueModule implements OnModuleDestroy {
  constructor(@Inject(EXTRACTION_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
