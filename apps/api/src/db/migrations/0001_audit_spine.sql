CREATE TYPE "public"."actor_type" AS ENUM('requester', 'reviewer', 'system', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."request_event_type" AS ENUM('submitted', 'probe_performed', 'probe_failed', 'approved', 'rejected', 'note_amended', 'expired', 'job_queued', 'job_deferred_low_disk', 'job_started', 'code_fetched', 'job_completed', 'job_failed', 'extraction_alert_raised', 'extraction_alert_cleared', 'extraction_rerun_queued', 'mail_sent', 'mail_send_failed', 'mail_send_abandoned', 'delivery_alert_raised', 'download_attempted', 'collection_lapse_raised', 'collection_lapse_cleared', 'download_token_revoked', 'expired_uncollected', 'object_deleted');--> statement-breakpoint
CREATE TYPE "public"."reviewer_event_type" AS ENUM('login_succeeded', 'login_failed', 'logged_out', 'session_expired', 'password_changed', 'seeded', 'totp_enrolled', 'deactivated');--> statement-breakpoint
CREATE TABLE "request_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"reviewer_id" uuid,
	"ip" "inet",
	"user_agent" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" uuid NOT NULL,
	"type" "request_event_type" NOT NULL,
	CONSTRAINT "actor_reviewer_id" CHECK (("request_event"."actor_type" = 'reviewer') = ("request_event"."reviewer_id" IS NOT NULL)),
	CONSTRAINT "actor_ip_user_agent" CHECK ("request_event"."actor_type" IN ('requester', 'anonymous')
        OR ("request_event"."ip" IS NULL AND "request_event"."user_agent" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "reviewer_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"reviewer_id" uuid,
	"ip" "inet",
	"user_agent" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"type" "reviewer_event_type" NOT NULL,
	CONSTRAINT "actor_reviewer_id" CHECK (("reviewer_event"."actor_type" = 'reviewer') = ("reviewer_event"."reviewer_id" IS NOT NULL)),
	CONSTRAINT "actor_ip_user_agent" CHECK ("reviewer_event"."actor_type" IN ('requester', 'anonymous')
        OR ("reviewer_event"."ip" IS NULL AND "reviewer_event"."user_agent" IS NULL))
);
--> statement-breakpoint
-- The application role (spec §12.2). Hand-written: drizzle-kit does not model
-- roles or grants. NOLOGIN so no credential lives in a migration; the operator
-- gives it a login and password at deploy time. There is no admin role:
-- Redaction was removed (ADR 0019) and nothing else needs one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dds_app') THEN
    CREATE ROLE dds_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- The event tables are append-only: the application role holds INSERT and
-- SELECT and nothing else on them. Any grant added here later is what §12.2's
-- whole enforcement argument rests on not being made. (The migrating role owns
-- the tables and so keeps its own privileges; the running application never
-- connects as it.)
REVOKE ALL ON "request_event", "reviewer_event" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO dds_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "request_event", "reviewer_event" TO dds_app;
--> statement-breakpoint
-- USAGE lets INSERT draw from the bigserial; it does not allow setval.
GRANT USAGE ON SEQUENCE "request_event_id_seq", "reviewer_event_id_seq" TO dds_app;
