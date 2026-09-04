import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';

// Placeholder table proving the migration pipeline runs end to end.
// The first issue that owns real persistence replaces this.
export const bootCheck = pgTable('boot_check', {
  id: serial('id').primaryKey(),
  migratedAt: timestamp('migrated_at', { withTimezone: true }).notNull().defaultNow(),
});
