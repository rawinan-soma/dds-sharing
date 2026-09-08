// Dev/CI credentials for the two application-side roles the migrations
// create: app_role (0001_grant_app_role_province.sql, the app's one runtime
// identity) and admin_role (0004_grant_app_role_events.sql, what Redaction
// will connect as) — keep these in sync with those files. Production
// rotates them with ALTER ROLE ... PASSWORD.

export const APP_ROLE = { user: "app_role", password: "app_role" };
export const ADMIN_ROLE = { user: "admin_role", password: "admin_role" };

/** Swaps the user/password of a Postgres connection string, keeping host, port and database. */
export function connectAs(connectionString: string, role: { user: string; password: string }): string {
  const url = new URL(connectionString);
  url.username = role.user;
  url.password = role.password;
  return url.toString();
}
