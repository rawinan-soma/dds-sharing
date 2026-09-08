CREATE TYPE "public"."actor_type" AS ENUM('requester', 'reviewer', 'system', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."request_event_type" AS ENUM('submitted', 'probe_performed', 'probe_failed', 'approved', 'rejected', 'note_amended', 'expired', 'contact_redacted', 'job_queued', 'job_deferred_low_disk', 'job_started', 'code_fetched', 'job_completed', 'job_failed', 'extraction_alert_raised', 'extraction_alert_cleared', 'extraction_rerun_queued', 'mail_sent', 'mail_send_failed', 'mail_send_abandoned', 'delivery_alert_raised', 'download_attempted', 'collection_lapse_raised', 'collection_lapse_cleared', 'download_token_revoked', 'download_token_reissued', 'expired_uncollected', 'object_deleted');--> statement-breakpoint
CREATE TYPE "public"."reviewer_event_type" AS ENUM('login_succeeded', 'login_failed', 'logged_out', 'session_expired', 'password_changed', 'seeded', 'totp_enrolled', 'deactivated');--> statement-breakpoint
CREATE TABLE "request_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"type" "request_event_type" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"reviewer_id" uuid,
	"ip" text,
	"user_agent" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_event_reviewer_id_iff_reviewer" CHECK (("request_event"."actor_type" = 'reviewer') = ("request_event"."reviewer_id" IS NOT NULL)),
	CONSTRAINT "request_event_ip_iff_unauth" CHECK (("request_event"."actor_type" IN ('requester', 'anonymous')) = ("request_event"."ip" IS NOT NULL)),
	CONSTRAINT "request_event_user_agent_iff_unauth" CHECK (("request_event"."actor_type" IN ('requester', 'anonymous')) = ("request_event"."user_agent" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "reviewer_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"type" "reviewer_event_type" NOT NULL,
	"ip" text,
	"user_agent" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "request_event_request_id_idx" ON "request_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "reviewer_event_reviewer_id_idx" ON "reviewer_event" USING btree ("reviewer_id");