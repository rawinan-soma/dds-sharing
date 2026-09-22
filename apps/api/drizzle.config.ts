import { defineConfig } from 'drizzle-kit';
import { migrationSchema, validateEnvOrExit } from './src/config/env.schema';

// The owner's URL, validated, with no fallback: Drizzle Kit must never quietly
// point at a database nobody chose.
const { DATABASE_URL: url } = validateEnvOrExit(migrationSchema);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
});
