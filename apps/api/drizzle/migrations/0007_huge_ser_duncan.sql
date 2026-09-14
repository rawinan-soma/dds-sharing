CREATE TABLE "reviewer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"totp_secret" text NOT NULL,
	"totp_confirmed_at" timestamp with time zone,
	"totp_last_used_step" bigint,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "reviewer_login_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"next_allowed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reviewer_session_reviewer_id_idx" ON "reviewer_session" USING btree ("reviewer_id");