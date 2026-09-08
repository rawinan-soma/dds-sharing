import { integer, pgTable, text, varchar } from "drizzle-orm/pg-core";

// The 77-row province lookup (spec §6.4, ADR 0002). `docs/provinces.csv`
// stays canonical — this table is generated from it and never edited by
// hand. `province_id` is a code, not a quantity (§4.6: codes occupy 10-96,
// uniformly two digits), so it stays a string.
export const province = pgTable("province", {
  provinceId: varchar("province_id", { length: 2 }).primaryKey(),
  nameTh: text("name_th").notNull(),
  healthRegion: integer("health_region").notNull(),
});
