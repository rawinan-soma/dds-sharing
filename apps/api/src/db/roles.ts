// Dev/CI credentials for the two roles the roles-and-grants migration
// creates (drizzle/migrations/0001_roles_and_grants.sql) — keep these two
// files in sync. Production rotates them with ALTER ROLE ... PASSWORD.

export const APP_ROLE = { user: "dds_app", password: "dds_app_dev_password" };
export const ADMIN_ROLE = { user: "dds_admin", password: "dds_admin_dev_password" };

/** Swaps the user/password of a Postgres connection string, keeping host, port and database. */
export function connectAs(connectionString: string, role: { user: string; password: string }): string {
  const url = new URL(connectionString);
  url.username = role.user;
  url.password = role.password;
  return url.toString();
}
