-- §12.2: enforced by database roles, not by convention. `app_role` already
-- exists (0001_grant_app_role_province.sql) as this application's one
-- runtime identity; this migration only extends its grants to the event
-- tables — INSERT/SELECT, DELETE nowhere — and introduces `admin_role`, the
-- separate identity the Redaction command will connect as. Redaction will
-- also need write access to `request_contact` once #63 creates it (adding
-- that grant is that ticket's job — it must never widen what app_role can
-- do).
--
-- admin_role's password is a dev/CI default, the same tier as app_role's own
-- password and the postgres/postgres, minioadmin/minioadmin credentials
-- already in docker-compose.yml. Production rotates it with
-- ALTER ROLE ... PASSWORD, same as any other credential here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    CREATE ROLE admin_role LOGIN PASSWORD 'admin_role';
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO admin_role', current_database());
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO admin_role;
--> statement-breakpoint

-- INSERT/SELECT only. No UPDATE, no DELETE — the omission is the enforcement.
GRANT SELECT, INSERT ON TABLE "request_event", "reviewer_event" TO app_role;
--> statement-breakpoint

-- Redaction connects as admin_role. It writes `contact_redacted` events (so
-- it needs the same event-table grants as app_role) but, like app_role,
-- holds no UPDATE or DELETE on the event tables — Redaction reaches
-- request_contact, never the record itself.
GRANT SELECT, INSERT ON TABLE "request_event", "reviewer_event" TO admin_role;
--> statement-breakpoint

-- bigserial ordering is backed by a sequence; INSERT needs USAGE on it too.
GRANT USAGE, SELECT ON SEQUENCE "request_event_id_seq", "reviewer_event_id_seq" TO app_role, admin_role;
