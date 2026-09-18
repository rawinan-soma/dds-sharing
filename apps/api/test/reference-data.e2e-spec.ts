import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PROVINCE_SEED_CHECKSUM } from '../src/reference/province-seed.generated';
import { ProvinceLookup } from '../src/reference/province-lookup.service';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const SEED_MIGRATION = join(
  __dirname,
  '../src/db/migrations/0002_seed_province.sql',
);

describe('reference data at boot (e2e)', () => {
  let db: ScratchDatabase;
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    db = await createScratchDatabase();
    process.env.STATIC_ROOT = 'test/fixtures/public';
  });

  afterAll(async () => {
    process.env.DATABASE_URL = originalUrl;
    delete process.env.STATIC_ROOT;
    await db.drop();
  });

  // Boot as the application does: through DATABASE_URL, as the read-only role.
  const boot = async (): Promise<INestApplication> => {
    process.env.DATABASE_URL = db.appUrl;
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    return app;
  };

  beforeEach(async () => {
    // Each test starts from the seed as migrated, whatever the last one broke.
    await db.owner.query('TRUNCATE "province"');
    const seed = readFileSync(SEED_MIGRATION, 'utf-8');
    await db.owner.query(seed);
  });

  it('boots against the seeded table and holds the 77 provinces', async () => {
    const app = await boot();
    const lookup = app.get(ProvinceLookup);

    expect(lookup.provinces).toHaveLength(77);
    expect(lookup.checksum).toBe(PROVINCE_SEED_CHECKSUM);
    expect(lookup.healthRegionOf('10')).toBe(13);
    await app.close();
  });

  it('fails boot when a province row is missing', async () => {
    await db.owner.query(`DELETE FROM "province" WHERE province_id = '96'`);

    await expect(boot()).rejects.toThrow(/76 rows.*expected 77/);
  });

  it('fails boot when one province sits in the wrong health region', async () => {
    await db.owner.query(
      `UPDATE "province" SET health_region = 12 WHERE province_id = '10'`,
    );

    await expect(boot()).rejects.toThrow(/checksum/);
  });

  describe('the application role', () => {
    let app: Pool;

    beforeAll(() => {
      app = new Pool({ connectionString: db.appUrl });
    });
    afterAll(() => app.end());

    it('can read the province table', async () => {
      const { rowCount } = await app.query('SELECT * FROM "province"');

      expect(rowCount).toBe(77);
    });

    it.each([
      ['INSERT', `INSERT INTO "province" VALUES ('97', 'x', 1)`],
      ['UPDATE', `UPDATE "province" SET health_region = 1`],
      ['DELETE', `DELETE FROM "province"`],
      ['TRUNCATE', `TRUNCATE "province"`],
    ])('cannot %s it', async (_verb, statement) => {
      await expect(app.query(statement)).rejects.toThrow(/permission denied/);
    });
  });
});
