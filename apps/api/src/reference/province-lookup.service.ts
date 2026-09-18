import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import { province } from '../db/schema';
import { type ProvinceRow } from './province-rows';
import { assertProvinceSeed } from './province-seed-check';
import {
  PROVINCE_SEED_CHECKSUM,
  PROVINCE_SEED_ROW_COUNT,
} from './province-seed.generated';

// Reads the province table once at boot and holds it (§6.4): a per-row join
// would let a mid-job edit put two regions for one province in one Extract.
// A table that disagrees with the seed rejects onModuleInit, so the process
// never starts listening.
@Injectable()
export class ProvinceLookup implements OnModuleInit {
  private rows: readonly ProvinceRow[] = [];
  private tableChecksum = '';

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    const rows = await drizzle(this.pool).select().from(province);

    this.tableChecksum = assertProvinceSeed(rows, {
      rowCount: PROVINCE_SEED_ROW_COUNT,
      checksum: PROVINCE_SEED_CHECKSUM,
    });
    this.rows = rows;
  }

  get provinces(): readonly ProvinceRow[] {
    return this.rows;
  }

  /** Joins the job-completion event, so two hashes for one ask can be explained. */
  get checksum(): string {
    return this.tableChecksum;
  }

  healthRegionOf(provinceId: string): number | undefined {
    return this.rows.find((r) => r.provinceId === provinceId)?.healthRegion;
  }
}
