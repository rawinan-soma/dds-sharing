import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { httpAppSchema, validateEnv } from './env.schema';
import { NAMESPACE_MAPPERS } from './namespaces';

const testEnv = parseEnv(
  readFileSync(new URL('../../.env.test', import.meta.url), 'utf8'),
) as Record<string, string>;

const schemaKeys = Object.keys(
  httpAppSchema.describe().keys as Record<string, unknown>,
);

/** Runs a mapper against a stand-in that records every variable it reads. */
function variablesRead(mapper: (v: Record<string, string>) => unknown) {
  const read = new Set<string>();
  const env = new Proxy(validateEnv(httpAppSchema, testEnv), {
    get(target, name: string) {
      read.add(name);
      return target[name];
    },
  });
  mapper(env);
  return [...read];
}

describe('the config namespaces', () => {
  it.each(Object.entries(NAMESPACE_MAPPERS))(
    'read only variables that are in the schema: %s',
    (_name, mapper) => {
      const read = variablesRead(mapper);
      expect(read.length).toBeGreaterThan(0);
      expect(schemaKeys).toEqual(expect.arrayContaining(read));
    },
  );

  it('expose no DATABASE_URL: the HTTP app never sees the owner', () => {
    expect(schemaKeys).not.toContain('DATABASE_URL');
    for (const mapper of Object.values(NAMESPACE_MAPPERS)) {
      expect(variablesRead(mapper)).not.toContain('DATABASE_URL');
    }

    const sentinel = 'postgres://owner:OWNER-SENTINEL@host/db';
    const env = validateEnv(httpAppSchema, {
      ...testEnv,
      DATABASE_URL: sentinel,
    });
    for (const mapper of Object.values(NAMESPACE_MAPPERS)) {
      expect(JSON.stringify(mapper(env))).not.toContain('OWNER-SENTINEL');
    }
  });

  it('map the validated variables to typed objects', () => {
    const env = validateEnv(httpAppSchema, testEnv);
    expect(NAMESPACE_MAPPERS.smtp(env)).toEqual({
      host: 'smtp.test',
      port: 587,
      startTls: true,
      secure: false,
      allowPlaintext: false,
      user: 'test-smtp-user',
      pass: 'test-smtp-pass',
      from: 'noreply@dds.test',
    });
    expect(NAMESPACE_MAPPERS.app(env)).toMatchObject({
      port: 3000,
      trustProxy: false,
    });
    expect(NAMESPACE_MAPPERS.minio(env)).toMatchObject({
      port: 9000,
      useSsl: true,
    });
    expect(NAMESPACE_MAPPERS.transport(env)).toEqual({
      allowInsecureTransport: false,
    });
  });

  it.each([
    ['true', true],
    ['false', false],
    ['2', 2],
    ['10.0.0.0/8', '10.0.0.0/8'],
  ])('read TRUST_PROXY=%s as %j', (value, expected) => {
    const env = validateEnv(httpAppSchema, { ...testEnv, TRUST_PROXY: value });
    expect(NAMESPACE_MAPPERS.app(env).trustProxy).toBe(expected);
  });
});
