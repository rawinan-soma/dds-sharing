CREATE TYPE "public"."request_state" AS ENUM('pending', 'rejected', 'expired', 'approved', 'collected', 'expired_uncollected', 'abandoned');--> statement-breakpoint
CREATE SEQUENCE "public"."request_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"state" "request_state" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"disease_group_id" text NOT NULL,
	"disease_group_name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"report_codes" text[] NOT NULL,
	"provinces" char(2)[] NOT NULL,
	CONSTRAINT "request_reference_unique" UNIQUE("reference"),
	CONSTRAINT "request_report_codes_nonempty" CHECK (cardinality("request"."report_codes") > 0),
	CONSTRAINT "request_dates_ordered" CHECK ("request"."start_date" <= "request"."end_date"),
	CONSTRAINT "request_span_cap" CHECK ("request"."end_date" - "request"."start_date" <= 365)
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
ALTER TABLE "request_event" ADD CONSTRAINT "request_event_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_event_submitted_ip" ON "request_event" USING btree ("ip") WHERE "request_event"."type" = 'submitted';--> statement-breakpoint
-- Hand-written, like the grants in 0001 and 0002: drizzle-kit does not model
-- them. The application role may create and read a Request and its contact
-- details, and nothing more. `request_contact` gets no UPDATE and no DELETE, ever
-- (spec §12.2, ADR 0019); `request` gets no UPDATE here — the ticket that first
-- changes a Request's state grants exactly that, and reviews it as a grant.
REVOKE ALL ON TABLE "request", "request_contact" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "request", "request_contact" TO "dds_app";
--> statement-breakpoint
-- USAGE lets nextval() draw a reference number; it does not allow setval.
GRANT USAGE ON SEQUENCE "request_reference_seq" TO "dds_app";
