-- §12.2: enforced by database roles, not by convention. The application role
-- holds INSERT/SELECT on the event tables and DELETE nowhere; a separate admin
-- role exists for the Redaction command, which will need write access to
-- `request_contact` once #63 creates it (adding that grant is that ticket's
-- job — it must never widen what dds_app can do).
--
-- Passwords are dev/CI defaults, the same tier as the postgres/postgres and
-- minioadmin/minioadmin credentials already in docker-compose.yml. Production
-- rotates them with ALTER ROLE ... PASSWORD, same as any other credential
-- here. Keep these literals in sync with apps/api/src/db/roles.ts, which the
-- database-enforcement test builds a connection string from, and with
-- docker-compose.yml's APP_DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dds_app') THEN
    CREATE ROLE dds_app LOGIN PASSWORD 'dds_app_dev_password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dds_admin') THEN
    CREATE ROLE dds_admin LOGIN PASSWORD 'dds_admin_dev_password';
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO dds_app, dds_admin', current_database());
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO dds_app, dds_admin;
--> statement-breakpoint

-- INSERT/SELECT only. No UPDATE, no DELETE — the omission is the enforcement.
GRANT SELECT, INSERT ON TABLE "request_event", "reviewer_event" TO dds_app;
--> statement-breakpoint

-- Redaction connects as dds_admin. It writes `contact_redacted` events (so it
-- needs the same event-table grants as dds_app) but, like dds_app, holds no
-- UPDATE or DELETE on the event tables — Redaction reaches request_contact,
-- never the record itself.
GRANT SELECT, INSERT ON TABLE "request_event", "reviewer_event" TO dds_admin;
--> statement-breakpoint

-- bigserial ordering is backed by a sequence; INSERT needs USAGE on it too.
GRANT USAGE, SELECT ON SEQUENCE "request_event_id_seq", "reviewer_event_id_seq" TO dds_app, dds_admin;
