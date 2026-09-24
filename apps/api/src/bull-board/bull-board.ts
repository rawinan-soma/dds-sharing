import { createServer, type RequestListener, type Server } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { appConfig, dbConfig, redisConfig } from '../config/namespaces';
import { bullPrefix } from '../db/bull-prefix';
import { EXTRACTION_QUEUE_NAME } from '../extraction/extraction.config';
import { createRedisConnection } from '../extraction/redis-connection';
import { MAIL_QUEUE_NAME } from '../mail/mail-queue';

/**
 * Bull Board on a listener of its own (spec §14.4) — never a route of the app:
 *
 * - **Not on the public ingress.** It has no auth of its own and would ride
 *   the single origin, so it is not mounted on the app's port at all.
 * - **Not behind Reviewer auth.** A Reviewer's entire job is to never see
 *   case data, and a raw job inspector on their surface leaves them one
 *   unlucky error payload away from it.
 *
 * Reached by SSH port-forward from the Docker host. Read-only: Postgres, not
 * Redis, is the truth about what ran, and a retry pressed here would bypass
 * it. A debugging tool carrying no watcher obligation — `/health` and the
 * Reviewer queue hold that duty.
 */
export async function listenBullBoard(
  queues: Queue[],
  bind: { host: string; port: number },
): Promise<Server> {
  const adapter = new ExpressAdapter();
  adapter.setBasePath('/');
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q, { readOnlyMode: true })),
    serverAdapter: adapter,
  });
  const server = createServer(adapter.getRouter() as RequestListener);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(bind.port, bind.host, () => resolve());
  });
  return server;
}

/**
 * Started explicitly from `main.ts`, like the tick, so an e2e spec that boots
 * the app never contends for the port.
 */
@Injectable()
export class BullBoard implements OnApplicationShutdown {
  private readonly logger = new Logger('BullBoard');
  private server?: Server;
  private connection?: Redis;
  private queues: Queue[] = [];

  constructor(
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
    @Inject(redisConfig.KEY)
    private readonly redis: ConfigType<typeof redisConfig>,
    @Inject(dbConfig.KEY) private readonly db: ConfigType<typeof dbConfig>,
  ) {}

  async start(): Promise<void> {
    const connection = createRedisConnection(this.redis.url);
    this.connection = connection;
    const prefix = bullPrefix(this.db.url);
    this.queues = [EXTRACTION_QUEUE_NAME, MAIL_QUEUE_NAME].map(
      (name) => new Queue(name, { connection, prefix }),
    );
    const { host, port } = this.app.bullBoard;
    this.server = await listenBullBoard(this.queues, { host, port });
    this.logger.log(`listening on ${host}:${port}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    await Promise.all(this.queues.map((q) => q.close()));
    await this.connection?.quit().catch(() => undefined);
  }
}
