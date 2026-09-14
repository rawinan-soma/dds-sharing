import { describe, it, expect } from "vitest";
import {
  httpAppEnvSchema,
  databaseUrlSchema,
  hostCliEnvSchema,
  fakeUpstreamEnvSchema,
  validateEnv,
} from "./env-schema.js";

const VALID_HTTP_APP_ENV = {
  PORT: "3000",
  APP_DATABASE_URL: "postgres://app_role:SENTINEL_DB_PASS@localhost:5432/dds_sharing",
  REDIS_URL: "redis://localhost:6379",
  MINIO_ENDPOINT: "localhost",
  MINIO_PORT: "9000",
  MINIO_USE_SSL: "false",
  MINIO_ACCESS_KEY: "SENTINEL_MINIO_ACCESS_KEY",
  MINIO_SECRET_KEY: "SENTINEL_MINIO_SECRET_KEY",
  MINIO_BUCKET: "dds-sharing",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_STARTTLS: "false",
  SMTP_SECURE: "false",
  SMTP_USER: "SENTINEL_SMTP_USER",
  SMTP_PASS: "SENTINEL_SMTP_PASS",
  SMTP_FROM: "noreply@example.com",
  SMTP_ALLOW_PLAINTEXT: "true",
  UPSTREAM_TOKEN: "SENTINEL_UPSTREAM_TOKEN",
  UPSTREAM_BASE_URL: "https://upstream.example.com",
  FRONTEND_URL: "https://app.example.com",
  ALLOW_INSECURE_TRANSPORT: "false",
};

function validateHttpApp(overrides: Record<string, string | undefined>) {
  const env = { ...VALID_HTTP_APP_ENV, ...overrides };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete (env as Record<string, unknown>)[key];
  }
  return httpAppEnvSchema().validate(env, { abortEarly: false });
}

describe("httpAppEnvSchema", () => {
  it("accepts a fully valid environment", () => {
    const { error } = validateHttpApp({});
    expect(error).toBeUndefined();
  });

  it("defaults PORT to 3000 when unset", () => {
    const { value, error } = validateHttpApp({ PORT: undefined });
    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
  });

  it("fails boot when SMTP_PASS is missing", () => {
    const { error } = validateHttpApp({ SMTP_PASS: undefined });
    expect(error?.message).toContain("SMTP_PASS");
  });

  it("fails when SMTP_STARTTLS=false and SMTP_SECURE=false without SMTP_ALLOW_PLAINTEXT", () => {
    const { error } = validateHttpApp({
      SMTP_STARTTLS: "false",
      SMTP_SECURE: "false",
      SMTP_ALLOW_PLAINTEXT: "false",
    });
    expect(error?.message).toMatch(/SMTP_ALLOW_PLAINTEXT/);
  });

  it("allows SMTP_STARTTLS=false and SMTP_SECURE=false when SMTP_ALLOW_PLAINTEXT=true", () => {
    const { error } = validateHttpApp({
      SMTP_STARTTLS: "false",
      SMTP_SECURE: "false",
      SMTP_ALLOW_PLAINTEXT: "true",
    });
    expect(error).toBeUndefined();
  });

  it("fails when SMTP_STARTTLS=true and SMTP_SECURE=true", () => {
    const { error } = validateHttpApp({ SMTP_STARTTLS: "true", SMTP_SECURE: "true" });
    expect(error?.message).toMatch(/SMTP_STARTTLS/);
  });

  it("fails when FRONTEND_URL is http:// without ALLOW_INSECURE_TRANSPORT", () => {
    const { error } = validateHttpApp({
      FRONTEND_URL: "http://app.example.com",
      ALLOW_INSECURE_TRANSPORT: "false",
    });
    expect(error?.message).toMatch(/FRONTEND_URL/);
  });

  it("allows http:// FRONTEND_URL when ALLOW_INSECURE_TRANSPORT=true", () => {
    const { error } = validateHttpApp({
      FRONTEND_URL: "http://app.example.com",
      ALLOW_INSECURE_TRANSPORT: "true",
    });
    expect(error).toBeUndefined();
  });

  it("fails when UPSTREAM_BASE_URL is http:// without ALLOW_INSECURE_TRANSPORT", () => {
    const { error } = validateHttpApp({
      UPSTREAM_BASE_URL: "http://upstream.example.com",
      ALLOW_INSECURE_TRANSPORT: "false",
    });
    expect(error?.message).toMatch(/UPSTREAM_BASE_URL/);
  });

  it("allows http:// UPSTREAM_BASE_URL when ALLOW_INSECURE_TRANSPORT=true", () => {
    const { error } = validateHttpApp({
      UPSTREAM_BASE_URL: "http://upstream.example.com",
      ALLOW_INSECURE_TRANSPORT: "true",
    });
    expect(error).toBeUndefined();
  });

  it("fails when FRONTEND_URL carries a path", () => {
    const { error } = validateHttpApp({ FRONTEND_URL: "https://app.example.com/reviewer" });
    expect(error?.message).toMatch(/FRONTEND_URL/);
  });

  it("fails when FRONTEND_URL has a trailing slash", () => {
    const { error } = validateHttpApp({ FRONTEND_URL: "https://app.example.com/" });
    expect(error?.message).toMatch(/FRONTEND_URL/);
  });

  it("fails when FRONTEND_URL carries a query string", () => {
    const { error } = validateHttpApp({ FRONTEND_URL: "https://app.example.com?x=1" });
    expect(error?.message).toMatch(/FRONTEND_URL/);
  });

  it("fails when MINIO_ENDPOINT carries a scheme", () => {
    const { error } = validateHttpApp({ MINIO_ENDPOINT: "http://localhost" });
    expect(error?.message).toMatch(/MINIO_ENDPOINT/);
  });

  it("fails when MINIO_ENDPOINT carries a port", () => {
    const { error } = validateHttpApp({ MINIO_ENDPOINT: "localhost:9000" });
    expect(error?.message).toMatch(/MINIO_ENDPOINT/);
  });

  it.each(["MINIO_USE_SSL", "SMTP_STARTTLS", "SMTP_SECURE"])(
    "fails when %s is given as 1 instead of a strict boolean string",
    (key) => {
      const { error } = validateHttpApp({ [key]: "1" });
      expect(error?.message).toMatch(new RegExp(key));
    },
  );

  it.each(["MINIO_USE_SSL", "SMTP_STARTTLS", "SMTP_SECURE"])(
    "fails when %s is given as yes instead of a strict boolean string",
    (key) => {
      const { error } = validateHttpApp({ [key]: "yes" });
      expect(error?.message).toMatch(new RegExp(key));
    },
  );

  it.each(["MINIO_ACCESS_KEY", "MINIO_SECRET_KEY", "SMTP_USER", "SMTP_PASS", "UPSTREAM_TOKEN"])(
    "fails when %s has trailing whitespace",
    (key) => {
      const { error } = validateHttpApp({ [key]: "secret-value " });
      expect(error?.message).toMatch(new RegExp(key));
    },
  );

  it.each(["MINIO_ACCESS_KEY", "MINIO_SECRET_KEY", "SMTP_USER", "SMTP_PASS", "UPSTREAM_TOKEN"])(
    "fails when %s has leading whitespace",
    (key) => {
      const { error } = validateHttpApp({ [key]: " secret-value" });
      expect(error?.message).toMatch(new RegExp(key));
    },
  );

  it("lists every problem at once (abortEarly: false)", () => {
    const { error } = validateHttpApp({ SMTP_PASS: undefined, REDIS_URL: "not-a-url" });
    expect(error?.details.length).toBeGreaterThanOrEqual(2);
    expect(error?.message).toMatch(/SMTP_PASS/);
    expect(error?.message).toMatch(/REDIS_URL/);
  });

  it("never echoes a secret's value into the error output", () => {
    const sentinel = "TOTALLY_SECRET_SENTINEL_VALUE";
    const { error } = validateHttpApp({
      SMTP_PASS: `${sentinel} `,
      UPSTREAM_TOKEN: ` ${sentinel}`,
      MINIO_SECRET_KEY: `${sentinel} `,
    });
    expect(error?.message).not.toContain(sentinel);
  });

  it("rejects a MINIO_BUCKET name with uppercase characters", () => {
    const { error } = validateHttpApp({ MINIO_BUCKET: "Not-Valid" });
    expect(error?.message).toMatch(/MINIO_BUCKET/);
  });

  it("rejects an invalid SMTP_FROM address", () => {
    const { error } = validateHttpApp({ SMTP_FROM: "not-an-email" });
    expect(error?.message).toMatch(/SMTP_FROM/);
  });
});

describe("databaseUrlSchema (migration runner / Drizzle Kit)", () => {
  it("requires DATABASE_URL and nothing else", () => {
    expect(Object.keys(databaseUrlSchema().describe().keys)).toEqual(["DATABASE_URL"]);
  });

  it("rejects a non-postgres scheme", () => {
    const { error } = databaseUrlSchema().validate({ DATABASE_URL: "mysql://x/y" });
    expect(error?.message).toMatch(/DATABASE_URL/);
  });
});

describe("hostCliEnvSchema", () => {
  it("always requires DATABASE_URL", () => {
    const { error } = hostCliEnvSchema().validate({});
    expect(error?.message).toMatch(/DATABASE_URL/);
  });

  it("accepts extra fields a specific command needs", () => {
    const schema = hostCliEnvSchema({ SOME_FLAG: httpAppEnvSchema().extract("PORT") });
    const { error } = schema.validate({
      DATABASE_URL: "postgres://x:y@localhost:5432/db",
      SOME_FLAG: "3000",
    });
    expect(error).toBeUndefined();
  });
});

describe("fakeUpstreamEnvSchema", () => {
  it("defaults FAKE_UPSTREAM_PORT to 4010 when unset", () => {
    const { error, value } = fakeUpstreamEnvSchema().validate({});
    expect(error).toBeUndefined();
    expect(value.FAKE_UPSTREAM_PORT).toBe(4010);
  });

  it("rejects an out-of-range port", () => {
    const { error } = fakeUpstreamEnvSchema().validate({ FAKE_UPSTREAM_PORT: "70000" });
    expect(error?.message).toMatch(/FAKE_UPSTREAM_PORT/);
  });
});

describe("validateEnv", () => {
  it("throws with a message naming every failing variable, never a value", () => {
    const sentinel = "MUST_NEVER_APPEAR";
    expect(() =>
      validateEnv(databaseUrlSchema(), { DATABASE_URL: sentinel } as NodeJS.ProcessEnv),
    ).toThrowError(/DATABASE_URL/);
    try {
      validateEnv(databaseUrlSchema(), { DATABASE_URL: sentinel } as NodeJS.ProcessEnv);
    } catch (error) {
      expect((error as Error).message).not.toContain(sentinel);
    }
  });

  it("returns the validated (and defaulted) value on success", () => {
    const result = validateEnv<{ DATABASE_URL: string }>(databaseUrlSchema(), {
      DATABASE_URL: "postgres://x:y@localhost:5432/db",
    } as NodeJS.ProcessEnv);
    expect(result.DATABASE_URL).toBe("postgres://x:y@localhost:5432/db");
  });
});
