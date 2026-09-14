import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import { createDb } from "./client.js";

export const APP_DB = Symbol("APP_DB");
export type AppDb = ReturnType<typeof createDb>;

/**
 * The application's one runtime database identity (app_role, §12.2) as a
 * long-lived injectable — unlike {@link "../reference-data/province-integrity.service.js"},
 * which opens and closes a connection for a single boot-time check, request
 * handling needs a pool that outlives any one request.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      useFactory: (): AppDb => {
        const connectionString = process.env.APP_DATABASE_URL;
        if (!connectionString) {
          throw new Error(
            "APP_DATABASE_URL is not set. The application must connect as the " +
              "read/write-restricted app_role, never the migration admin role (spec §12.2).",
          );
        }
        return createDb(connectionString);
      },
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
