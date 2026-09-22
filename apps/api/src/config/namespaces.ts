import { registerAs } from '@nestjs/config';
import { httpAppSchema, validateEnv } from './env.schema';

// One namespace per group, each mapping validated variables to a typed object.
// A service injects only the namespace it needs, as `ConfigType<typeof …>`.
//
// The mappers take the validated environment as an argument so a test can hand
// them a recording stand-in and see exactly which variables each one reads.
// There is no namespace for `DATABASE_URL`: the HTTP app never sees the owner.

type Vars = Record<string, string>;

const bool = (value: string) => value === 'true';

/**
 * Express's `trust proxy`: `true`, `false`, a hop count, or proxy addresses.
 * Duplicate suppression keys on the client IP (§4.8), so behind a proxy the app
 * must be told how many hops to believe.
 */
function trustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export const mapApp = (v: Vars) => ({
  port: Number(v.PORT),
  trustProxy: trustProxy(v.TRUST_PROXY),
  /** Relative to the working directory unless absolute. */
  staticRoot: v.STATIC_ROOT,
  frontendUrl: v.FRONTEND_URL,
  scratchDir: v.SCRATCH_DIR,
});

export const mapDb = (v: Vars) => ({ url: v.APP_DATABASE_URL });

export const mapRedis = (v: Vars) => ({ url: v.REDIS_URL });

export const mapMinio = (v: Vars) => ({
  endpoint: v.MINIO_ENDPOINT,
  port: Number(v.MINIO_PORT),
  useSsl: bool(v.MINIO_USE_SSL),
  accessKey: v.MINIO_ACCESS_KEY,
  secretKey: v.MINIO_SECRET_KEY,
  bucket: v.MINIO_BUCKET,
});

export const mapSmtp = (v: Vars) => ({
  host: v.SMTP_HOST,
  port: Number(v.SMTP_PORT),
  startTls: bool(v.SMTP_STARTTLS),
  secure: bool(v.SMTP_SECURE),
  allowPlaintext: bool(v.SMTP_ALLOW_PLAINTEXT),
  user: v.SMTP_USER,
  pass: v.SMTP_PASS,
  from: v.SMTP_FROM,
});

export const mapUpstream = (v: Vars) => ({
  baseUrl: v.UPSTREAM_BASE_URL,
  token: v.UPSTREAM_TOKEN,
});

export const mapTransport = (v: Vars) => ({
  allowInsecureTransport: bool(v.ALLOW_INSECURE_TRANSPORT),
});

/** Every mapper, by namespace: what `ConfigModule` loads. */
export const NAMESPACE_MAPPERS = {
  app: mapApp,
  db: mapDb,
  redis: mapRedis,
  minio: mapMinio,
  smtp: mapSmtp,
  upstream: mapUpstream,
  transport: mapTransport,
} as const;

// Validated again here, not read raw: the defaults and the cross-field rules
// then hold for whichever process asks, whatever `ConfigModule` assigned.
const validated = () => validateEnv(httpAppSchema);

export const appConfig = registerAs('app', () => mapApp(validated()));
export const dbConfig = registerAs('db', () => mapDb(validated()));
export const redisConfig = registerAs('redis', () => mapRedis(validated()));
export const minioConfig = registerAs('minio', () => mapMinio(validated()));
export const smtpConfig = registerAs('smtp', () => mapSmtp(validated()));
export const upstreamConfig = registerAs('upstream', () =>
  mapUpstream(validated()),
);
export const transportConfig = registerAs('transport', () =>
  mapTransport(validated()),
);

export const NAMESPACES = [
  appConfig,
  dbConfig,
  redisConfig,
  minioConfig,
  smtpConfig,
  upstreamConfig,
  transportConfig,
];
