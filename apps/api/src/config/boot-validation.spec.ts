import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { httpAppEnvSchema } from "./env-schema.js";

const ENV_TEST_PATH = new URL("../../.env.test", import.meta.url);
const envTestContents = readFileSync(ENV_TEST_PATH, "utf8");
const baseEnv = parse(envTestContents);

describe("boot validation against the checked-in .env.test", () => {
  it("boots cleanly with every variable .env.test provides", () => {
    const { error } = httpAppEnvSchema().validate(baseEnv, { abortEarly: false, allowUnknown: true });
    expect(error).toBeUndefined();
  });

  it("breaking several variables lists every problem and never echoes a sentinel secret", () => {
    const sentinel = baseEnv.SMTP_PASS; // .env.test's secrets are sentinel strings
    expect(sentinel).toMatch(/sentinel/i);

    // Each break below fails its own field's schema directly (as opposed to
    // one of the cross-field rules, which — a Joi object's own behaviour —
    // only run once every field has individually passed) so every problem
    // is guaranteed to surface in this one pass.
    const broken = {
      ...baseEnv,
      SMTP_PASS: `${sentinel} `, // trailing whitespace
      UPSTREAM_TOKEN: ` ${baseEnv.UPSTREAM_TOKEN}`, // leading whitespace
      MINIO_SECRET_KEY: `${baseEnv.MINIO_SECRET_KEY} `, // trailing whitespace
      MINIO_ENDPOINT: "http://localhost", // no scheme allowed
      MINIO_BUCKET: "Not-Valid-Bucket", // uppercase not allowed
    };

    const { error } = httpAppEnvSchema().validate(broken, { abortEarly: false, allowUnknown: true });
    expect(error).toBeDefined();
    expect(error!.details.length).toBeGreaterThanOrEqual(5);
    expect(error!.message).not.toContain(sentinel);
    expect(error!.message).toMatch(/SMTP_PASS/);
    expect(error!.message).toMatch(/UPSTREAM_TOKEN/);
    expect(error!.message).toMatch(/MINIO_SECRET_KEY/);
    expect(error!.message).toMatch(/MINIO_ENDPOINT/);
    expect(error!.message).toMatch(/MINIO_BUCKET/);
  });
});
