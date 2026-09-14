import { registerAs } from "@nestjs/config";

export const DB_CONFIG_ENV_KEYS = ["APP_DATABASE_URL"] as const;

export interface DbConfig {
  appDatabaseUrl: string;
}

/**
 * The HTTP app's only database namespace — the read/write-restricted
 * app_role connection string. Deliberately has no field for DATABASE_URL,
 * the migration admin credential the app must never hold (spec §12.2).
 */
export default registerAs(
  "db",
  (): DbConfig => ({
    appDatabaseUrl: process.env.APP_DATABASE_URL as string,
  }),
);
