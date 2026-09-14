import Joi from "joi";

// Every environment variable is a string, so a flag is validated as the
// literal string "true" or "false" — Joi.boolean()'s default coercion also
// accepts "1"/"0", which would silently let a typo like MINIO_USE_SSL=1
// through instead of failing loudly (spec §10.5).
const strictBooleanString = () => Joi.string().valid("true", "false");

function rejectSurroundingWhitespace(value: string, helpers: Joi.CustomHelpers) {
  if (value !== value.trim()) return helpers.error("string.trimmed");
  return value;
}

// Used only for non-secret strings (usernames, hosts) — never call .custom()
// error messages that echo `value` back, or a secret could leak into a boot
// failure log.
const nonEmptyTrimmed = () => Joi.string().min(1).custom(rejectSurroundingWhitespace);

function requireOriginOnly(value: string, helpers: Joi.CustomHelpers) {
  const url = new URL(value);
  if (value !== url.origin) return helpers.error("string.originOnly");
  return value;
}

const SHARED_MESSAGES = {
  "string.trimmed": '"{{#label}}" must not have leading or trailing whitespace',
  "string.originOnly": '"{{#label}}" must be an origin — no path, query string or trailing slash',
};

// §13.2's `N` and every other reviewed-constant policy value are deliberately
// absent from this schema (ADR 0018): the environment holds deployment
// facts only, never policy.

export const appSchemaFields = {
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
};

export const dbAppSchemaFields = {
  // The HTTP app validates only the read/write-restricted app_role
  // connection string — never DATABASE_URL, the migration admin credential
  // (spec §12.2). See dbMigrationSchemaFields for the admin role's schema.
  APP_DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
};

export const dbMigrationSchemaFields = {
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
};

export const redisSchemaFields = {
  REDIS_URL: Joi.string()
    .uri({ scheme: ["redis", "rediss"] })
    .required(),
};

export const minioSchemaFields = {
  MINIO_ENDPOINT: Joi.string().hostname().required(),
  MINIO_PORT: Joi.number().integer().min(1).max(65535).required(),
  MINIO_USE_SSL: strictBooleanString().required(),
  MINIO_ACCESS_KEY: nonEmptyTrimmed().required(),
  MINIO_SECRET_KEY: nonEmptyTrimmed().required(),
  // S3 bucket-name rules: 3-63 chars, lowercase, digits, hyphens.
  MINIO_BUCKET: Joi.string().min(3).max(63).pattern(/^[a-z0-9-]+$/).required(),
};

function smtpCrossFieldCheck(value: Record<string, unknown>, helpers: Joi.CustomHelpers) {
  const startTls = value.SMTP_STARTTLS === "true";
  const secure = value.SMTP_SECURE === "true";
  const allowPlaintext = value.SMTP_ALLOW_PLAINTEXT === "true";
  if (startTls && secure) return helpers.error("smtp.bothTlsModes");
  if (!startTls && !secure && !allowPlaintext) return helpers.error("smtp.plaintextNotAllowed");
  return value;
}

export const smtpSchemaFields = {
  SMTP_HOST: Joi.string().hostname().required(),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).required(),
  SMTP_STARTTLS: strictBooleanString().required(),
  SMTP_SECURE: strictBooleanString().required(),
  SMTP_USER: nonEmptyTrimmed().required(),
  SMTP_PASS: nonEmptyTrimmed().required(),
  SMTP_FROM: Joi.string().email().required(),
  SMTP_ALLOW_PLAINTEXT: strictBooleanString().default("false"),
};

export const upstreamSchemaFields = {
  UPSTREAM_TOKEN: nonEmptyTrimmed().required(),
  UPSTREAM_BASE_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .required(),
};

export const transportSchemaFields = {
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .custom(requireOriginOnly)
    .required(),
  ALLOW_INSECURE_TRANSPORT: strictBooleanString().default("false"),
};

export const fakeUpstreamSchemaFields = {
  FAKE_UPSTREAM_PORT: Joi.number().integer().min(1).max(65535).required(),
};

// FRONTEND_URL and UPSTREAM_BASE_URL each need https unless
// ALLOW_INSECURE_TRANSPORT=true (ADR 0018) — a cross-group rule, since
// UPSTREAM_BASE_URL lives in the upstream group and the flag lives in
// transport. It only applies where both groups are validated together,
// which today is the HTTP app alone.
function insecureTransportCheck(value: Record<string, unknown>, helpers: Joi.CustomHelpers) {
  if (value.ALLOW_INSECURE_TRANSPORT === "true") return value;
  if (typeof value.FRONTEND_URL === "string" && !value.FRONTEND_URL.startsWith("https://")) {
    return helpers.error("transport.frontendHttpsRequired");
  }
  if (typeof value.UPSTREAM_BASE_URL === "string" && !value.UPSTREAM_BASE_URL.startsWith("https://")) {
    return helpers.error("transport.upstreamHttpsRequired");
  }
  return value;
}

/**
 * The full validation schema for the HTTP app process (spec §11.2, §13.2,
 * ADR 0018) — every group it needs, validated together with `abortEarly:
 * false` so a boot failure names every problem at once.
 */
export function httpAppEnvSchema() {
  return Joi.object({
    ...appSchemaFields,
    ...dbAppSchemaFields,
    ...redisSchemaFields,
    ...minioSchemaFields,
    ...smtpSchemaFields,
    ...upstreamSchemaFields,
    ...transportSchemaFields,
  })
    .custom(smtpCrossFieldCheck)
    .custom(insecureTransportCheck)
    .messages({
      ...SHARED_MESSAGES,
      "smtp.bothTlsModes": "SMTP_STARTTLS and SMTP_SECURE cannot both be true",
      "smtp.plaintextNotAllowed":
        "SMTP_STARTTLS=false with SMTP_SECURE=false requires SMTP_ALLOW_PLAINTEXT=true",
      "transport.frontendHttpsRequired":
        '"FRONTEND_URL" must use https unless ALLOW_INSECURE_TRANSPORT=true',
      "transport.upstreamHttpsRequired":
        '"UPSTREAM_BASE_URL" must use https unless ALLOW_INSECURE_TRANSPORT=true',
    });
}

/** DATABASE_URL alone — the migration runner and Drizzle Kit's config (spec §13.2). */
export function databaseUrlSchema() {
  return Joi.object(dbMigrationSchemaFields);
}

/** A host CLI entrypoint: DATABASE_URL plus whatever else the command needs. */
export function hostCliEnvSchema(extraFields: Joi.PartialSchemaMap = {}) {
  return Joi.object({ ...dbMigrationSchemaFields, ...extraFields });
}

export function fakeUpstreamEnvSchema() {
  return Joi.object(fakeUpstreamSchemaFields);
}

// `process.env` always carries unrelated OS variables (PATH, HOME, ...) —
// allowUnknown lets a schema validate only the keys it names, matching
// @nestjs/config's own default for a Joi schema.
const DEFAULT_VALIDATION_OPTIONS: Joi.ValidationOptions = { abortEarly: false, allowUnknown: true };

/**
 * Validates `env` against `schema`, throwing an `Error` whose message lists
 * every problem by variable name if validation fails. Never include a raw
 * env value in a Joi message here — see `nonEmptyTrimmed` — so a boot
 * failure can be logged safely.
 */
export function validateEnv<T>(schema: Joi.ObjectSchema, env: NodeJS.ProcessEnv): T {
  const { error, value } = schema.validate(env, DEFAULT_VALIDATION_OPTIONS);
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  return value as T;
}
