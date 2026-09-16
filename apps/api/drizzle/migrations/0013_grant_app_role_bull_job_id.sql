-- The extraction worker sets `bull_job_id` when it enqueues or re-enqueues a
-- job (§7.7, ticket #69) — same reasoning as 0011's grant on `state`: column-
-- scoped, never a blanket UPDATE on "request".
GRANT UPDATE ("bull_job_id") ON TABLE "request" TO app_role;
