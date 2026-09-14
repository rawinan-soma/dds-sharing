import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { createDb } from "../db/client.js";
import { province } from "../db/schema.js";
import dbConfigFactory from "../config/db.config.js";
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

  constructor(
    @Inject(dbConfigFactory.KEY) private readonly dbConfig: ConfigType<typeof dbConfigFactory>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { pool, db } = createDb(this.dbConfig.appDatabaseUrl);
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
