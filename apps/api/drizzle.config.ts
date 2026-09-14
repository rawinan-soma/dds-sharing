import { defineConfig } from "drizzle-kit";
import { databaseUrlSchema, validateEnv } from "./src/config/env-schema.js";

const { DATABASE_URL } = validateEnv<{ DATABASE_URL: string }>(databaseUrlSchema(), process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
