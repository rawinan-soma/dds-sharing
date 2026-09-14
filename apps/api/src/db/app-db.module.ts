import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { createDb } from "./client.js";
import dbConfig from "../config/db.config.js";

export const APP_DB = Symbol("APP_DB");
export type AppDb = ReturnType<typeof createDb>;

/**
 * The application's one runtime database identity (app_role, §12.2) as a
 * long-lived injectable — unlike {@link "../reference-data/province-integrity.service.js"},
 * which opens and closes a connection for a single boot-time check, request
 * handling needs a pool that outlives any one request. `dbConfig` has no
 * field for DATABASE_URL, the migration admin credential — only the
 * validated app_role connection string ever reaches this factory.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      useFactory: (db: ConfigType<typeof dbConfig>): AppDb => createDb(db.appDatabaseUrl),
      inject: [dbConfig.KEY],
    },
  ],
  exports: [APP_DB],
})
export class AppDbModule implements OnModuleDestroy {
  constructor(@Inject(APP_DB) private readonly appDb: AppDb) {}

  async onModuleDestroy(): Promise<void> {
    await this.appDb.pool.end();
  }
}
