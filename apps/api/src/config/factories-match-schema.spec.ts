import { describe, it, expect } from "vitest";
import { APP_CONFIG_ENV_KEYS } from "./app.config.js";
import { DB_CONFIG_ENV_KEYS } from "./db.config.js";
import { REDIS_CONFIG_ENV_KEYS } from "./redis.config.js";
import { MINIO_CONFIG_ENV_KEYS } from "./minio.config.js";
import { SMTP_CONFIG_ENV_KEYS } from "./smtp.config.js";
import { UPSTREAM_CONFIG_ENV_KEYS } from "./upstream.config.js";
import { TRANSPORT_CONFIG_ENV_KEYS } from "./transport.config.js";
import { httpAppEnvSchema } from "./env-schema.js";

describe("every config factory reads only variables the HTTP app schema validates", () => {
  const schemaKeys = Object.keys(httpAppEnvSchema().describe().keys);

  const factoryKeyGroups: Record<string, readonly string[]> = {
    app: APP_CONFIG_ENV_KEYS,
    db: DB_CONFIG_ENV_KEYS,
    redis: REDIS_CONFIG_ENV_KEYS,
    minio: MINIO_CONFIG_ENV_KEYS,
    smtp: SMTP_CONFIG_ENV_KEYS,
    upstream: UPSTREAM_CONFIG_ENV_KEYS,
    transport: TRANSPORT_CONFIG_ENV_KEYS,
  };

  for (const [namespace, keys] of Object.entries(factoryKeyGroups)) {
    it(`${namespace} config's variables are all present in the schema`, () => {
      for (const key of keys) {
        expect(schemaKeys).toContain(key);
      }
    });
  }

  it("the schema validates exactly the union of every factory's variables", () => {
    const factoryKeys = Object.values(factoryKeyGroups).flat().sort();
    expect(schemaKeys.slice().sort()).toEqual(factoryKeys);
  });

  it("the HTTP app's db namespace never reads DATABASE_URL, the migration admin credential", () => {
    expect(DB_CONFIG_ENV_KEYS).not.toContain("DATABASE_URL");
    expect(DB_CONFIG_ENV_KEYS).toEqual(["APP_DATABASE_URL"]);
  });
});
