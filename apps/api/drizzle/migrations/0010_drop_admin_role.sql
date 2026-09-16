-- ADR 0019/0020: there is no Redaction, so the admin_role that Redaction
-- would have connected as (0004_grant_app_role_events.sql) has no remaining
-- purpose. Revoke everything it was granted, then drop the role itself.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM admin_role;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM admin_role;
--> statement-breakpoint

REVOKE USAGE ON SCHEMA public FROM admin_role;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM admin_role', current_database());
    DROP ROLE admin_role;
  END IF;
END
$$;
