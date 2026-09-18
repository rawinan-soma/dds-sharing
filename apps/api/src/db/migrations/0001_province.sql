CREATE TABLE "province" (
	"province_id" char(2) PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"health_region" smallint NOT NULL,
	CONSTRAINT "province_id_two_digits" CHECK ("province"."province_id" ~ '^[0-9]{2}$'),
	CONSTRAINT "province_health_region_range" CHECK ("province"."health_region" BETWEEN 1 AND 13)
);
--> statement-breakpoint
-- The application connects as a member of dds_app (create the login role and
-- GRANT dds_app to it on the host). Read-only on province is what makes a
-- production table that disagrees with the repo a detectable bug, not drift
-- (spec §6.4). The migrating role owns the table; the application never does.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dds_app') THEN
		CREATE ROLE "dds_app" NOLOGIN;
	END IF;
EXCEPTION
	-- Roles are cluster-wide: a concurrent migration may create it between the
	-- check and the CREATE.
	WHEN duplicate_object OR unique_violation THEN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON TABLE "province" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE "province" TO "dds_app";
