CREATE TYPE "public"."area_kind" AS ENUM('national', 'province', 'region');--> statement-breakpoint
CREATE TYPE "public"."request_state" AS ENUM('pending', 'queued', 'running', 'ready', 'delivered', 'collected', 'rejected', 'expired', 'failed', 'expired_uncollected');--> statement-breakpoint
CREATE TABLE "reference_number_counter" (
	"year" integer PRIMARY KEY NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_number" text NOT NULL,
	"state" "request_state" DEFAULT 'pending' NOT NULL,
	"disease_group_id" text NOT NULL,
	"disease_group_name_th" text NOT NULL,
	"report_codes" text[] NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"area_kind" "area_kind" DEFAULT 'national' NOT NULL,
	"area_region" integer,
	"area_provinces" text[] DEFAULT '{}' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_reference_number_unique" UNIQUE("reference_number"),
	CONSTRAINT "request_area_region_iff_region_kind" CHECK (("request"."area_kind" = 'region') = ("request"."area_region" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "request_contact" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"surname" text NOT NULL,
	"tel" text NOT NULL,
	"email" text NOT NULL,
	"workplace" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_contact" ADD CONSTRAINT "request_contact_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_event_type_ip_idx" ON "request_event" USING btree ("type","ip");