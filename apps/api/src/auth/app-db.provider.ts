import type { Provider } from "@nestjs/common";
import { createDb } from "../db/client.js";

/** The reviewer surface's one runtime database handle — connects as `app_role`, never the migration admin role (spec §17.5, §12.2). */
export const APP_DB = Symbol("APP_DB");

export const appDbProvider: Provider = {
  provide: APP_DB,
  useFactory: () => createDb(process.env.APP_DATABASE_URL).db,
};
