CREATE TYPE "public"."mail_delivery_status" AS ENUM('queued', 'sent', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."mail_kind" AS ENUM('delivery', 'queue_notification', 'rejection', 'extraction_failure');--> statement-breakpoint
CREATE TYPE "public"."token_lookup_kind" AS ENUM('page', 'archive');--> statement-breakpoint
CREATE TYPE "public"."token_lookup_outcome" AS ENUM('success', 'unknown_token', 'expired', 'revoked', 'attempts_exhausted', 'object_missing');--> statement-breakpoint
CREATE TABLE "download_throttle" (
	"ip" "inet" PRIMARY KEY NOT NULL,
	"failure_count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "download_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"archive_filename" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "download_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mail_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "mail_kind" NOT NULL,
	"status" "mail_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_lookup" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"download_token_id" uuid,
	"request_id" uuid,
	"token_prefix" text NOT NULL,
	"kind" "token_lookup_kind" NOT NULL,
	"outcome" "token_lookup_outcome" NOT NULL,
	"ip" "inet" NOT NULL,
	"user_agent" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "download_token" ADD CONSTRAINT "download_token_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_delivery" ADD CONSTRAINT "mail_delivery_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_lookup" ADD CONSTRAINT "token_lookup_download_token_id_download_token_id_fk" FOREIGN KEY ("download_token_id") REFERENCES "public"."download_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_lookup" ADD CONSTRAINT "token_lookup_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "download_token_request_id_idx" ON "download_token" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "mail_delivery_request_id_idx" ON "mail_delivery" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "mail_delivery_status_idx" ON "mail_delivery" USING btree ("status");--> statement-breakpoint
CREATE INDEX "token_lookup_download_token_id_idx" ON "token_lookup" USING btree ("download_token_id");--> statement-breakpoint
CREATE INDEX "token_lookup_ip_idx" ON "token_lookup" USING btree ("ip");--> statement-breakpoint
-- Grants, hand-written like 0001/0005/0006/0007 (drizzle-kit does not model
-- them).
--
-- `token_lookup` joins the audit spine: append-only, SELECT/INSERT only,
-- exactly like `request_event`/`reviewer_event` in 0001 — this is the audit
-- control spec §9.2 calls load-bearing.
--
-- `download_token` and `mail_delivery` are operational rows, like
-- `extraction_job` in 0007: updated in place as their lifecycle advances,
-- never deleted, so a permanent record of "was this token ever revoked" /
-- "did this email ever send" survives.
--
-- `download_throttle` is operational state the application both writes and
-- would need to clear if it ever supported a manual reset; nothing here does
-- that yet, so it gets no DELETE either — only what the running application
-- actually uses.
REVOKE ALL ON "download_token", "token_lookup", "mail_delivery", "download_throttle" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "token_lookup" TO dds_app;
--> statement-breakpoint
-- USAGE lets INSERT draw from the bigserial; it does not allow setval.
GRANT USAGE ON SEQUENCE "token_lookup_id_seq" TO dds_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "download_token" TO dds_app;
--> statement-breakpoint
-- Only `revoked_at` legitimately changes after insert (a future Re-run, ADR
-- 0012); nothing else about a Download token is ever rewritten.
GRANT UPDATE ("revoked_at") ON "download_token" TO dds_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "mail_delivery" TO dds_app;
--> statement-breakpoint
GRANT UPDATE ("status", "attempts", "last_error", "updated_at") ON "mail_delivery" TO dds_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "download_throttle" TO dds_app;