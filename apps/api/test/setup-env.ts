import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Fills in every env var the HTTP app schema validates with a dummy value
// (ticket #85) — never overrides a variable already set (CI sets
// DATABASE_URL/APP_DATABASE_URL itself; dotenv's default `override: false`
// leaves those alone).
config({ path: fileURLToPath(new URL("../.env.test", import.meta.url)) });
