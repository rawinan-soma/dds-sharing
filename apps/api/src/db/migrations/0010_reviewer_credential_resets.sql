-- Spec §12.4: a host reset or re-enrolment is recorded the moment it runs,
-- naming the account and never who ran it (ADR 0020). The grants of 0001
-- already cover these rows: insert-only, like every Reviewer event.
ALTER TYPE "public"."reviewer_event_type" ADD VALUE 'password_reset';--> statement-breakpoint
ALTER TYPE "public"."reviewer_event_type" ADD VALUE 'totp_reset';