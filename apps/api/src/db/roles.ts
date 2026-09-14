// Dev/CI credentials for app_role, the application's one runtime identity
// (0001_grant_app_role_province.sql) — keep this in sync with that file.
// Production rotates it with ALTER ROLE ... PASSWORD.

export const APP_ROLE = { user: "app_role", password: "app_role" };

/** Swaps the user/password of a Postgres connection string, keeping host, port and database. */
export function connectAs(connectionString: string, role: { user: string; password: string }): string {
  const url = new URL(connectionString);
  url.username = role.user;
  url.password = role.password;
  return url.toString();
}
