export interface AppConfig {
  port: number;
  /** Explicit, never derived from the Host header (docs/adr, spec §16.2). */
  baseUrl: string;
  databaseUrl: string;
  disk: {
    path: string;
    warnPercent: number;
    unhealthyPercent: number;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export default (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  baseUrl: requireEnv('BASE_URL'),
  databaseUrl: requireEnv('DATABASE_URL'),
  disk: {
    path: process.env.DISK_HEALTH_PATH ?? '/',
    warnPercent: Number(process.env.DISK_WARN_PERCENT ?? 75),
    unhealthyPercent: Number(process.env.DISK_UNHEALTHY_PERCENT ?? 90),
  },
});
