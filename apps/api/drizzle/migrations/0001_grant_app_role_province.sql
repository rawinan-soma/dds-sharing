-- The application role is read-only on the province table (spec §6.4,
-- ADR 0002): a production database disagreeing with docs/provinces.csv must
-- be a detectable bug, never silent drift. This migration runs as the admin
-- role (DATABASE_URL); the running application connects as `app_role`
-- (APP_DATABASE_URL) and never has write access to this table.
--
-- Dev/CI credentials only, matching the rest of this scaffold's local
-- passwords (postgres/postgres, minioadmin/minioadmin) — a real deployment
-- rotates this via the host's ops runbook, not via code.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role LOGIN PASSWORD 'app_role';
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_role', current_database());
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_role;
--> statement-breakpoint
GRANT SELECT ON province TO app_role;
