CREATE TABLE "boot_check" (
	"id" serial PRIMARY KEY NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL
);
