CREATE TABLE "scheduler_heartbeat" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"beat_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scheduler_heartbeat_single_row" CHECK ("scheduler_heartbeat"."id" = 1)
);
--> statement-breakpoint
-- Grants, hand-written like 0001/0005–0008 (drizzle-kit does not model them).
-- The heartbeat is one row the tick overwrites every pass: SELECT, INSERT for
-- the first pass ever, and UPDATE of the one column that moves. No DELETE.
--
-- ⚠️ This ticket adds the pruning job, and it needs DELETE on exactly
-- `reviewer_session` and `login_throttle` — which 0005 already granted, and
-- nothing else (spec §15.4). No DELETE is granted here or anywhere else for it:
-- the application role holding DELETE on any other table is what §12.2's
-- whole enforcement argument rests on it not having, and
-- test/scheduler-tick.e2e-spec.ts asserts the complete list.
REVOKE ALL ON "scheduler_heartbeat" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "scheduler_heartbeat" TO dds_app;
--> statement-breakpoint
GRANT UPDATE ("beat_at") ON "scheduler_heartbeat" TO dds_app;
