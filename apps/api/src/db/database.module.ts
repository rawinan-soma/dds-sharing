import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Pool } from 'pg';

const logger = new Logger('Database');

export const PG_POOL = Symbol('PG_POOL');

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
      useFactory: () => {
        // Never DATABASE_URL: that is the owner that migrates. Falling back to
        // it would make the read-only role (§6.4) true on paper only.
        const connectionString = process.env.APP_DATABASE_URL;
        if (!connectionString) {
          throw new Error('APP_DATABASE_URL must be set');
        }
        const pool = new Pool({ connectionString });
        // An idle client dropped by the server must not crash the process.
        pool.on('error', (error) => logger.error(error.message));
        return pool;
      },
    },
    PoolShutdown,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
