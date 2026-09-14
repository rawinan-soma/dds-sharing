-- ADR 0019: there is no Redaction, so `contact_redacted` leaves the
-- catalogue rather than staying unused (§12.4: a type that can never be
-- written is a lie in the schema). Postgres cannot drop a single enum value
-- in place, so the type is recreated without it. See also ADR 0020, which
-- removes the operator name this event's payload used to carry.
ALTER TABLE "request_event" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."request_event_type";--> statement-breakpoint
CREATE TYPE "public"."request_event_type" AS ENUM('submitted', 'probe_performed', 'probe_failed', 'approved', 'rejected', 'note_amended', 'expired', 'job_queued', 'job_deferred_low_disk', 'job_started', 'code_fetched', 'job_completed', 'job_failed', 'extraction_alert_raised', 'extraction_alert_cleared', 'extraction_rerun_queued', 'mail_sent', 'mail_send_failed', 'mail_send_abandoned', 'delivery_alert_raised', 'download_attempted', 'collection_lapse_raised', 'collection_lapse_cleared', 'download_token_revoked', 'download_token_reissued', 'expired_uncollected', 'object_deleted');--> statement-breakpoint
ALTER TABLE "request_event" ALTER COLUMN "type" SET DATA TYPE "public"."request_event_type" USING "type"::"public"."request_event_type";