import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real AppModule, booted the way main.ts boots it, against an environment
// this test controls. None of these reach a database: a boot that failed for any
// reason but configuration would say so.

const testEnv = parseEnv(
  readFileSync(new URL('../../.env.test', import.meta.url), 'utf8'),
) as Record<string, string>;

const SENTINEL = 'SENTINEL-must-never-be-printed';

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
});
afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, saved);
});

function setEnv(env: Record<string, string | undefined>) {
  for (const key of Object.keys(testEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
}

async function boot() {
  // A fresh module graph: the schema is checked when AppModule is loaded.
  vi.resetModules();
  const core = await import('@nestjs/core');
  const { AppModule } =
    (await import('../app.module')) as typeof import('../app.module');
  return core.NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
}

async function bootError(env: Record<string, string | undefined>) {
  setEnv(env);
  const error = await boot().then(
    () => undefined,
    (e: unknown) => e as Error,
  );
  expect(error, 'boot should have failed').toBeInstanceOf(Error);
  return `${error!.message}\n${error!.stack}`;
}

describe('HTTP app boot', () => {
  it('refuses to boot, listing every missing and invalid variable at once', async () => {
    const output = await bootError({
      ...testEnv,
      SMTP_PASS: undefined,
      REDIS_URL: undefined,
      MINIO_USE_SSL: 'yes',
    });

    expect(output).toContain('Config validation error');
    expect(output).toContain('SMTP_PASS');
    expect(output).toContain('REDIS_URL');
    expect(output).toContain('MINIO_USE_SSL');
  });

  it('fails on configuration alone, before anything connects or listens', async () => {
    // Every database is unreachable here. A boot that got as far as the pool
    // would fail differently; this one must fail on the first missing variable.
    const output = await bootError({
      ...testEnv,
      UPSTREAM_TOKEN: undefined,
      APP_DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none',
    });

    expect(output).toContain('UPSTREAM_TOKEN');
    expect(output).not.toMatch(/ECONNREFUSED|password authentication/);
  });

  it('never prints a value: secrets set to sentinel strings stay out of the error', async () => {
    const output = await bootError({
      ...testEnv,
      SMTP_PASS: `${SENTINEL} `,
      MINIO_ACCESS_KEY: `${SENTINEL}-access`,
      MINIO_SECRET_KEY: ` ${SENTINEL}-secret`,
      UPSTREAM_TOKEN: `${SENTINEL}-token\n`,
      APP_DATABASE_URL: `mysql://user:${SENTINEL}@host/db`,
      REDIS_URL: `http://:${SENTINEL}@host`,
      FRONTEND_URL: `http://${SENTINEL}.test/path/`,
      SMTP_HOST: `${SENTINEL} host`,
      SMTP_PORT: SENTINEL,
      SMTP_STARTTLS: SENTINEL,
      SMTP_USER: undefined,
    });

    expect(output).toContain('SMTP_PASS');
    expect(output).toContain('SMTP_USER');
    expect(output).not.toContain(SENTINEL);
  });

  it('boots when the environment is valid', async () => {
    setEnv(testEnv);
    const app = await boot();
    await app.close();
  });
});
