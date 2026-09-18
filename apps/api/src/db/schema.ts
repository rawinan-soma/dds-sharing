import { sql } from 'drizzle-orm';
import { char, check, pgTable, smallint, text } from 'drizzle-orm/pg-core';

// Tables land here as later tickets need them (e.g. #61 audit spine).

// The seeded province lookup (spec §6.4). Seeded by a migration generated from
// docs/provinces.csv; the application role is read-only on it.
export const province = pgTable(
  'province',
  {
    provinceId: char('province_id', { length: 2 }).primaryKey(),
    nameTh: text('name_th').notNull(),
    healthRegion: smallint('health_region').notNull(),
  },
  (t) => [
    check('province_id_two_digits', sql`${t.provinceId} ~ '^[0-9]{2}$'`),
    check(
      'province_health_region_range',
      sql`${t.healthRegion} BETWEEN 1 AND 13`,
    ),
  ],
);
