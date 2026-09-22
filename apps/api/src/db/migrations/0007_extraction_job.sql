CREATE TYPE "public"."extraction_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "extraction_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" "extraction_job_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_progress_at" timestamp with time zone,
	"result" jsonb,
	"failure_cause" text
);
--> statement-breakpoint
ALTER TABLE "extraction_job" ADD CONSTRAINT "extraction_job_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_job_request_id_idx" ON "extraction_job" USING btree ("request_id");
--> statement-breakpoint
-- Hand-written, like the grants in 0001, 0004, 0005 and 0006: drizzle-kit does
-- not model them. The application role creates a row at approval and updates
-- it as the job runs — never DELETE (spec §15.4 names exactly two tables where
-- that is correct, and this is not one of them: the row is this job's audit
-- trail of its own progress, not disposable operational state).
REVOKE ALL ON TABLE "extraction_job" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "extraction_job" TO "dds_app";
--> statement-breakpoint
GRANT UPDATE (
  "status", "started_at", "finished_at", "last_progress_at", "result", "failure_cause"
) ON "extraction_job" TO "dds_app";