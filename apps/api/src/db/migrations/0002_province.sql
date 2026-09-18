CREATE TABLE "province" (
	"province_id" char(2) PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"health_region" smallint NOT NULL,
	CONSTRAINT "province_id_two_digits" CHECK ("province"."province_id" ~ '^[0-9]{2}$'),
	CONSTRAINT "province_health_region_range" CHECK ("province"."health_region" BETWEEN 1 AND 13)
);
--> statement-breakpoint
-- The application connects as a member of dds_app, which 0001_audit_spine
-- creates (create the login role and GRANT dds_app to it on the host).
-- Read-only on province is what makes a production table that disagrees with
-- the repo a detectable bug, not drift (spec §6.4). The migrating role owns the
-- table; the application never does.
REVOKE ALL ON TABLE "province" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE "province" TO "dds_app";
