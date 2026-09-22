import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  EnvValidationError,
  fakeUpstreamSchema,
  httpAppSchema,
  hostCliSchema,
  migrationSchema,
  validateEnv,
  type Env,
} from './env.schema';

// The checked-in test environment is a valid environment for the HTTP app.
const testEnv = parseEnv(
  readFileSync(new URL('../../.env.test', import.meta.url), 'utf8'),
) as Env;

const without = (env: Env, ...names: string[]): Env =>
  Object.fromEntries(Object.entries(env).filter(([k]) => !names.includes(k)));

const problemsOf = (env: Env, schema = httpAppSchema): string => {
  try {
    validateEnv(schema, env);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.message;
    throw error;
  }
  return '';
};

describe('the HTTP app environment', () => {
  it('accepts the checked-in .env.test', () => {
    expect(problemsOf(testEnv)).toBe('');
  });

  it('lists every missing variable at once, by name', () => {
    const message = problemsOf(without(testEnv, 'SMTP_PASS', 'REDIS_URL'));
    expect(message).toContain('SMTP_PASS is required');
    expect(message).toContain('REDIS_URL is required');
  });

  it.each([
    'TRUST_PROXY',
    'STATIC_ROOT',
    'FRONTEND_URL',
    'APP_DATABASE_URL',
    'REDIS_URL',
    'MINIO_ENDPOINT',
    'MINIO_PORT',
    'MINIO_USE_SSL',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_STARTTLS',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'UPSTREAM_BASE_URL',
    'UPSTREAM_TOKEN',
  ])('requires %s, with no default', (name) => {
    expect(problemsOf(without(testEnv, name))).toContain(`${name} is required`);
  });

  it('defaults only PORT and the two insecure flags', () => {
    const env = without(
      testEnv,
      'PORT',
      'ALLOW_INSECURE_TRANSPORT',
      'SMTP_ALLOW_PLAINTEXT',
    );
    expect(validateEnv(httpAppSchema, env)).toMatchObject({
      PORT: '3000',
      ALLOW_INSECURE_TRANSPORT: 'false',
      SMTP_ALLOW_PLAINTEXT: 'false',
    });
  });

  it('does not require DATABASE_URL, which the app must never read', () => {
    expect(problemsOf(without(testEnv, 'DATABASE_URL'))).toBe('');
  });

  describe('SMTP transport', () => {
    it('refuses plaintext unless SMTP_ALLOW_PLAINTEXT is true', () => {
      const env = { ...testEnv, SMTP_STARTTLS: 'false', SMTP_SECURE: 'false' };
      expect(problemsOf(env)).toContain('SMTP_ALLOW_PLAINTEXT');
      expect(problemsOf({ ...env, SMTP_ALLOW_PLAINTEXT: 'true' })).toBe('');
    });

    it('refuses STARTTLS and implicit TLS together, even with the plaintext flag', () => {
      const env = {
        ...testEnv,
        SMTP_STARTTLS: 'true',
        SMTP_SECURE: 'true',
        SMTP_ALLOW_PLAINTEXT: 'true',
      };
      expect(problemsOf(env)).toContain(
        'SMTP_SECURE is true with SMTP_STARTTLS true',
      );
    });

    it('reports the plaintext rule even while other variables also fail', () => {
      const env = {
        ...without(testEnv, 'SMTP_PASS'),
        SMTP_STARTTLS: 'false',
        SMTP_SECURE: 'false',
      };
      const message = problemsOf(env);
      expect(message).toContain('SMTP_PASS is required');
      expect(message).toContain(
        'SMTP_SECURE is false with SMTP_STARTTLS false',
      );
    });

    it('accepts either TLS mode alone', () => {
      expect(
        problemsOf({ ...testEnv, SMTP_STARTTLS: 'false', SMTP_SECURE: 'true' }),
      ).toBe('');
    });
  });

  describe('FRONTEND_URL', () => {
    it('refuses http without ALLOW_INSECURE_TRANSPORT', () => {
      const env = { ...testEnv, FRONTEND_URL: 'http://frontend.test' };
      expect(problemsOf(env)).toContain('FRONTEND_URL');
      expect(problemsOf({ ...env, ALLOW_INSECURE_TRANSPORT: 'true' })).toBe('');
    });

    it.each([
      'https://frontend.test/app',
      'https://frontend.test/',
      'https://frontend.test?x=1',
    ])('refuses anything past the origin: %s', (url) => {
      expect(problemsOf({ ...testEnv, FRONTEND_URL: url })).toContain(
        'FRONTEND_URL must be an origin only',
      );
    });
  });

  describe('UPSTREAM_BASE_URL', () => {
    it('allows a path prefix', () => {
      expect(
        problemsOf({ ...testEnv, UPSTREAM_BASE_URL: 'https://u.test/a/b/v1' }),
      ).toBe('');
    });

    it('refuses http without ALLOW_INSECURE_TRANSPORT', () => {
      const env = { ...testEnv, UPSTREAM_BASE_URL: 'http://u.test/v1' };
      expect(problemsOf(env)).toContain('UPSTREAM_BASE_URL');
      expect(problemsOf({ ...env, ALLOW_INSECURE_TRANSPORT: 'true' })).toBe('');
    });
  });

  it('refuses a MINIO_ENDPOINT with a scheme or a port', () => {
    expect(
      problemsOf({ ...testEnv, MINIO_ENDPOINT: 'https://minio.test' }),
    ).toContain('MINIO_ENDPOINT');
    expect(
      problemsOf({ ...testEnv, MINIO_ENDPOINT: 'minio.test:9000' }),
    ).toContain('MINIO_ENDPOINT');
  });

  it.each([
    'MINIO_USE_SSL',
    'SMTP_STARTTLS',
    'SMTP_SECURE',
    'ALLOW_INSECURE_TRANSPORT',
    'SMTP_ALLOW_PLAINTEXT',
  ])('reads %s as strictly true or false', (name) => {
    for (const value of ['1', 'yes', 'TRUE', '']) {
      expect(problemsOf({ ...testEnv, [name]: value })).toContain(
        `${name} must be exactly true or false`,
      );
    }
  });

  it.each(['SMTP_PASS', 'SMTP_USER', 'MINIO_SECRET_KEY', 'UPSTREAM_TOKEN'])(
    'refuses %s with leading or trailing whitespace',
    (name) => {
      for (const value of ['secret ', ' secret', 'secret\n']) {
        expect(problemsOf({ ...testEnv, [name]: value })).toContain(
          `${name} must not have leading or trailing whitespace`,
        );
      }
      expect(problemsOf({ ...testEnv, [name]: '' })).toContain(name);
    },
  );

  it.each(['0', '65536', '3000abc', '1e3', '-1', ' 80', '0x50'])(
    'refuses the port %j',
    (value) => {
      expect(problemsOf({ ...testEnv, PORT: value })).toContain(
        'PORT must be an integer from 1 to 65535',
      );
      expect(problemsOf({ ...testEnv, SMTP_PORT: value })).toContain(
        'SMTP_PORT',
      );
    },
  );

  it.each([
    'ab',
    'Bucket',
    'has_underscore',
    '-lead',
    'trail-',
    'a'.repeat(64),
  ])('refuses the bucket name %j', (value) => {
    expect(problemsOf({ ...testEnv, MINIO_BUCKET: value })).toContain(
      'MINIO_BUCKET',
    );
  });

  it.each([
    ['APP_DATABASE_URL', 'mysql://u:p@h/db'],
    ['REDIS_URL', 'http://redis:6379'],
    ['SMTP_FROM', 'not-an-address'],
    ['SMTP_HOST', 'smtp host'],
  ])('refuses a malformed %s', (name, value) => {
    expect(problemsOf({ ...testEnv, [name]: value })).toContain(name);
  });

  it.each(['true', 'false', '1', '2', '10.0.0.0/8', 'loopback, 10.0.0.1'])(
    'accepts TRUST_PROXY=%s',
    (value) => {
      expect(problemsOf({ ...testEnv, TRUST_PROXY: value })).toBe('');
    },
  );

  it('refuses a TRUST_PROXY that is not a hop count or an address', () => {
    expect(problemsOf({ ...testEnv, TRUST_PROXY: 'ture' })).toContain(
      'TRUST_PROXY',
    );
  });

  it('never prints a value, whichever rule it broke', () => {
    const sentinel = 'SENTINEL-value-that-must-not-print';
    const broken: Env = {
      ...testEnv,
      SMTP_PASS: `${sentinel} `,
      MINIO_SECRET_KEY: `${sentinel}\n`,
      UPSTREAM_TOKEN: ` ${sentinel}`,
      APP_DATABASE_URL: `mysql://user:${sentinel}@host/db`,
      REDIS_URL: `http://:${sentinel}@host`,
      FRONTEND_URL: `http://${sentinel}.test/path/`,
      MINIO_BUCKET: sentinel,
      MINIO_ENDPOINT: `https://${sentinel}`,
      SMTP_FROM: sentinel,
      SMTP_HOST: sentinel + ' x',
      PORT: sentinel,
      SMTP_PORT: sentinel,
      TRUST_PROXY: sentinel,
      SMTP_STARTTLS: sentinel,
      MINIO_USE_SSL: sentinel,
    };
    const message = problemsOf(broken);
    expect(message).toContain('SMTP_PASS');
    expect(message).not.toContain('SENTINEL');
  });
});

describe('the other processes', () => {
  it('the migration runner validates DATABASE_URL and nothing else', () => {
    expect(
      problemsOf({ DATABASE_URL: testEnv.DATABASE_URL }, migrationSchema),
    ).toBe('');
    expect(problemsOf({}, migrationSchema)).toBe(
      'Invalid configuration:\n  - DATABASE_URL is required',
    );
  });

  it('host commands validate the application role, not the owner', () => {
    expect(
      problemsOf({ APP_DATABASE_URL: testEnv.APP_DATABASE_URL }, hostCliSchema),
    ).toBe('');
    expect(
      problemsOf({ DATABASE_URL: testEnv.DATABASE_URL }, hostCliSchema),
    ).toContain('APP_DATABASE_URL is required');
  });

  it('the fake upstream validates its port', () => {
    expect(problemsOf({ FAKE_UPSTREAM_PORT: '4010' }, fakeUpstreamSchema)).toBe(
      '',
    );
    expect(problemsOf({}, fakeUpstreamSchema)).toContain(
      'FAKE_UPSTREAM_PORT is required',
    );
  });
});
