-- §7.7 (ticket #69): "a job row is written to Postgres at approval; the
-- BullMQ job carries a reference, never the authoritative state." The
-- Request row already is that job row (its `state` already carries
-- queued/running/ready/failed); this column is the reference the worker
-- and the reconcile step use to find the matching BullMQ job.
ALTER TABLE "request" ADD COLUMN "bull_job_id" text;
