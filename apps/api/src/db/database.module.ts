import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { dbConfig } from '../config/namespaces';

const logger = new Logger('Database');

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

/** The Drizzle handle over the application pool (never the owner's). */
export type Db = NodePgDatabase;

@Injectable()
class PoolShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [dbConfig.KEY],
      useFactory: (db: ConfigType<typeof dbConfig>) => {
        // Never DATABASE_URL: that is the owner that migrates, and the `db`
        // namespace does not carry it. A fallback to it would make the
        // read-only role (§6.4) true on paper only.
        const pool = new Pool({ connectionString: db.url });
        // An idle client dropped by the server must not crash the process.
        pool.on('error', (error) => logger.error(error.message));
        return pool;
      },
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Db => drizzle(pool),
    },
    PoolShutdown,
  ],
  exports: [PG_POOL, DB],
})
export class DatabaseModule {}
