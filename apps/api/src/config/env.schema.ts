import { isIP } from 'node:net';
import Joi from 'joi';

// The environment holds deployment facts, not policy (NFR-31). Every variable
// is required and has no default, except the three that name a safe choice.
//
// Nothing here may echo a value. A failure lists variable names and the rule
// they broke, so a secret that fails a rule never reaches a log.

export type Env = Record<string, string | undefined>;

/** The three variables with a default: each one is the safe setting. */
export const ENV_DEFAULTS = {
  PORT: '3000',
  ALLOW_INSECURE_TRANSPORT: 'false',
  SMTP_ALLOW_PLAINTEXT: 'false',
} as const;

// Static templates only: Joi's defaults print the offending value for some
// rules (a pattern mismatch does), and a rejected secret must stay unprinted.
const MESSAGES: Record<string, string> = {
  'any.required': 'is required',
  'any.invalid': 'is not an allowed value',
  'any.only': 'is not an allowed value',
  'any.custom': 'is not valid',
  'string.base': 'must be a string',
  'string.empty': 'must not be empty',
  'string.uri': 'must be a valid URI',
  'string.uriCustomScheme': 'must use an allowed URI scheme',
  'string.hostname': 'must be a hostname',
  'string.email': 'must be an email address',
  'string.pattern.base': 'is malformed',
  'env.port': 'must be an integer from 1 to 65535',
  'env.boolean': 'must be exactly true or false',
  'env.secret': 'must not have leading or trailing whitespace',
  'env.bucket':
    'must be an S3 bucket name: 3-63 lowercase letters, digits or hyphens',
  'env.origin': 'must be an origin only: no path, query or trailing slash',
  'env.https': 'must be https unless ALLOW_INSECURE_TRANSPORT is true',
  'env.trustProxy':
    'must be true, false, a hop count, or a list of proxy addresses',
  'smtp.plaintext':
    'is false with SMTP_STARTTLS false, which sends mail in plaintext: set SMTP_ALLOW_PLAINTEXT to true to allow it',
  'smtp.bothTls':
    'is true with SMTP_STARTTLS true: choose implicit TLS or STARTTLS, not both',
};

const S = Joi.string();

const port = S.custom((value: string, helpers) => {
  if (!/^\d{1,5}$/.test(value)) return helpers.error('env.port');
  const n = Number(value);
  return n >= 1 && n <= 65535 ? value : helpers.error('env.port');
});

const boolean = S.valid('true', 'false').messages({
  'any.only': MESSAGES['env.boolean'],
  'string.empty': MESSAGES['env.boolean'],
});

const secret = S.custom((value: string, helpers) =>
  value === value.trim() ? value : helpers.error('env.secret'),
);

const bucket = S.custom((value: string, helpers) =>
  /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)
    ? value
    : helpers.error('env.bucket'),
);

const uri = (...scheme: string[]) => S.uri({ scheme });

const originOnly = (value: string, helpers: Joi.CustomHelpers) => {
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    return helpers.error('string.uri');
  }
  return origin === value ? value : helpers.error('env.origin');
};

// `https` unless the operator has said, in so many words, that this deployment
// has no TLS. An unparseable flag is not `true`, so it also demands `https`.
const secureUrl = (base: Joi.StringSchema) =>
  Joi.when('ALLOW_INSECURE_TRANSPORT', {
    is: 'true',
    then: base.concat(uri('http', 'https')).required(),
    otherwise: base
      .concat(uri('https'))
      .messages({ 'string.uriCustomScheme': MESSAGES['env.https'] })
      .required(),
  });

// Express's `trust proxy`: true, false, a hop count, or proxy addresses.
const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const trustProxy = S.custom((value: string, helpers) => {
  if (value === 'true' || value === 'false' || /^\d+$/.test(value))
    return value;
  const entries = value.split(',').map((entry) => entry.trim());
  const valid = entries.every((entry) => {
    if (TRUST_PROXY_KEYWORDS.has(entry)) return true;
    const [address, prefix, ...rest] = entry.split('/');
    if (rest.length > 0 || !isIP(address)) return false;
    return prefix === undefined || /^\d{1,3}$/.test(prefix);
  });
  return valid ? value : helpers.error('env.trustProxy');
});

type Group = Record<string, Joi.Schema>;

export const appGroup: Group = {
  PORT: port.default(ENV_DEFAULTS.PORT),
  TRUST_PROXY: trustProxy.required(),
  STATIC_ROOT: secret.required(),
  FRONTEND_URL: secureUrl(S.custom(originOnly)),
  // The local scratch volume the extraction job's disk floor checks (spec
  // §7.8) and, from a later ticket, writes each Report code's output to.
  SCRATCH_DIR: secret.required(),
};

/** What the HTTP app connects as. Never the owner (§6.4). */
export const dbGroup: Group = {
  APP_DATABASE_URL: uri('postgres', 'postgresql').required(),
};

/** The owner that migrates. Only the migration runner and Drizzle Kit read it. */
export const ownerDbGroup: Group = {
  DATABASE_URL: uri('postgres', 'postgresql').required(),
};

export const redisGroup: Group = {
  REDIS_URL: uri('redis', 'rediss').required(),
};

export const minioGroup: Group = {
  MINIO_ENDPOINT: S.hostname().required(),
  MINIO_PORT: port.required(),
  MINIO_USE_SSL: boolean.required(),
  MINIO_ACCESS_KEY: secret.required(),
  MINIO_SECRET_KEY: secret.required(),
  MINIO_BUCKET: bucket.required(),
};

// The cross-field rules live on SMTP_SECURE, not on the object: an object-level
// rule is skipped when any other variable also fails, and every problem must
// be listed at once. A STARTTLS value that is not `true`/`false` is left to its
// own error rather than guessed at here.
const smtpSecure = Joi.when('SMTP_STARTTLS', {
  switch: [
    {
      is: 'true',
      then: boolean
        .invalid('true')
        .messages({ 'any.invalid': MESSAGES['smtp.bothTls'] })
        .required(),
    },
    {
      is: 'false',
      then: Joi.when('SMTP_ALLOW_PLAINTEXT', {
        is: 'true',
        then: boolean.required(),
        otherwise: boolean
          .invalid('false')
          .messages({ 'any.invalid': MESSAGES['smtp.plaintext'] })
          .required(),
      }),
    },
  ],
  otherwise: boolean.required(),
});

export const smtpGroup: Group = {
  SMTP_HOST: S.hostname().required(),
  SMTP_PORT: port.required(),
  SMTP_STARTTLS: boolean.required(),
  SMTP_SECURE: smtpSecure,
  SMTP_ALLOW_PLAINTEXT: boolean.default(ENV_DEFAULTS.SMTP_ALLOW_PLAINTEXT),
  SMTP_USER: secret.required(),
  SMTP_PASS: secret.required(),
  SMTP_FROM: S.email({ tlds: { allow: false } }).required(),
};

export const upstreamGroup: Group = {
  UPSTREAM_BASE_URL: secureUrl(S),
  UPSTREAM_TOKEN: secret.required(),
};

export const transportGroup: Group = {
  ALLOW_INSECURE_TRANSPORT: boolean.default(
    ENV_DEFAULTS.ALLOW_INSECURE_TRANSPORT,
  ),
};

/** Development only: the harness that stands in for the upstream API. */
export const fakeUpstreamGroup: Group = {
  FAKE_UPSTREAM_PORT: port.required(),
};

function schemaOf(groups: Group[]): Joi.ObjectSchema<Env> {
  const keys = Object.assign({}, ...groups) as Group;
  return Joi.object<Env>(keys).messages(MESSAGES);
}

/** Everything the HTTP app reads. `DATABASE_URL` is deliberately not in it. */
export const httpAppSchema = schemaOf([
  appGroup,
  dbGroup,
  redisGroup,
  minioGroup,
  smtpGroup,
  upstreamGroup,
  transportGroup,
]);

/** The migration runner and Drizzle Kit. */
export const migrationSchema = schemaOf([ownerDbGroup]);

/** Host commands connect as the application role, like the app (§6.4). */
export const hostCliSchema = schemaOf([dbGroup]);

export const fakeUpstreamSchema = schemaOf([fakeUpstreamGroup]);

export class EnvValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates `env` against one process's schema and returns it with defaults
 * applied. Throws every problem at once, by variable name, never a value.
 * Reading `process.env` is allowed here and nowhere else in `src`.
 */
export function validateEnv(
  schema: Joi.ObjectSchema<Env>,
  env: Env = process.env,
): Record<string, string> {
  const result = schema.validate(env, {
    abortEarly: false,
    allowUnknown: true,
  });
  const { error } = result;
  if (error) {
    throw new EnvValidationError(
      error.details.map((detail) => {
        const name = detail.path.join('.');
        return name ? `${name} ${detail.message}` : detail.message;
      }),
    );
  }
  return result.value as Record<string, string>;
}

/**
 * For the entrypoints outside Nest: validate, and on failure print the problems
 * and exit non-zero before anything else runs.
 */
export function validateEnvOrExit(
  schema: Joi.ObjectSchema<Env>,
  env: Env = process.env,
): Record<string, string> {
  try {
    return validateEnv(schema, env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
