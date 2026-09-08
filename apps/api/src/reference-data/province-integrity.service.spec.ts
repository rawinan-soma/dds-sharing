import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "../db/migrate.js";
import { ProvinceIntegrityService } from "./province-integrity.service.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("ProvinceIntegrityService", () => {
  let adminPool: Pool;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    adminPool = new Pool({ connectionString: adminUrl });
  });

  afterAll(async () => {
    await adminPool.end();
  });

  it("resolves when the seeded table matches docs/provinces.csv", async () => {
    await expect(
      new ProvinceIntegrityService().onApplicationBootstrap(),
    ).resolves.not.toThrow();
  });

  it("rejects (fails boot) when a row has drifted from the seed", async () => {
    await adminPool.query(
      `UPDATE province SET health_region = 99 WHERE province_id = '10'`,
    );
    try {
      await expect(
        new ProvinceIntegrityService().onApplicationBootstrap(),
      ).rejects.toThrow(/checksum mismatch/);
    } finally {
      await adminPool.query(
        `UPDATE province SET health_region = 13 WHERE province_id = '10'`,
      );
    }
  });

  it("cannot write through the application role — it is read-only", async () => {
    const appPool = new Pool({ connectionString: appUrl });
    try {
      await expect(
        appPool.query(
          `UPDATE province SET health_region = 1 WHERE province_id = '10'`,
        ),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await appPool.end();
    }
  });
});
