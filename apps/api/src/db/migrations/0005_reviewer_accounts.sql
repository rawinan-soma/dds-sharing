CREATE TABLE "login_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"next_allowed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"totp_secret" text NOT NULL,
	"totp_confirmed_at" timestamp with time zone,
	"totp_last_used_step" bigint,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_username_unique" UNIQUE("username"),
	CONSTRAINT "reviewer_username_format" CHECK ("reviewer"."username" ~ '^[a-z0-9._-]{3,32}$')
);
--> statement-breakpoint
CREATE TABLE "reviewer_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reviewer_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "reviewer_session" ADD CONSTRAINT "reviewer_session_reviewer_id_reviewer_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviewer_session_reviewer_id_idx" ON "reviewer_session" USING btree ("reviewer_id");--> statement-breakpoint
ALTER TABLE "request_event" ADD CONSTRAINT "request_event_reviewer_id_reviewer_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_event" ADD CONSTRAINT "reviewer_event_reviewer_id_reviewer_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Grants, hand-written (drizzle-kit does not model them). A Reviewer is never
-- removed: the application role gets no DELETE on `reviewer`, and UPDATE only on
-- the columns that legitimately change, so `username` and `display_name` (the
-- name every Decision carries, permanently) cannot be rewritten by the running
-- application any more than the event tables can.
REVOKE ALL ON "reviewer", "reviewer_session", "login_throttle" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "reviewer" TO dds_app;
--> statement-breakpoint
GRANT UPDATE (
  "password_hash", "must_change_password", "totp_secret",
  "totp_confirmed_at", "totp_last_used_step", "deactivated_at"
) ON "reviewer" TO dds_app;
--> statement-breakpoint
-- Operational state: genuinely deletable (spec §12.3, §15.4).
GRANT SELECT, INSERT, UPDATE, DELETE ON "reviewer_session", "login_throttle" TO dds_app;
