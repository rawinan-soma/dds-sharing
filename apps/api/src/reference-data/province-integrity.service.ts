import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { createDb } from "../db/client.js";
import { province } from "../db/schema.js";
import { assertProvinceSeedIntegrity } from "./province-integrity.js";
import { PROVINCE_SEED_META } from "./province-seed.generated.js";

/**
 * Boot-time guard for the province lookup (spec §6.4, ADR 0002). Connects
 * as the read-only application role — never the migration admin role — and
 * asserts 77 rows and a checksum against `docs/provinces.csv`. A mismatch
 * throws, which fails Nest's bootstrap: this is a boot failure, never a
 * warning, never a degraded mode.
 */
@Injectable()
export class ProvinceIntegrityService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProvinceIntegrityService.name);

  async onApplicationBootstrap(): Promise<void> {
    const connectionString = process.env.APP_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "APP_DATABASE_URL is not set. The province seed integrity check must run as the " +
          "read-only application role, never the migration admin role (spec §6.4).",
      );
    }

    const { pool, db } = createDb(connectionString);
    try {
      const rows = await db
        .select()
        .from(province)
        .orderBy(province.provinceId);
      assertProvinceSeedIntegrity(rows, PROVINCE_SEED_META);
      this.logger.log(
        `Province seed verified: ${rows.length} rows, checksum ok.`,
      );
    } finally {
      await pool.end();
    }
  }
}
