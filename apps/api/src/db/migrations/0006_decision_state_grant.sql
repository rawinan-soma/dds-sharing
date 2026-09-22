-- Hand-written, like the grants in 0001, 0004 and 0005: drizzle-kit does not
-- model them. This is the ticket 0004 named: the Decision (spec §10.3) is the
-- first thing that ever changes a Request's state, so this is the grant that
-- lets it, and nothing more. Column-restricted to `state`: the application
-- role still cannot rewrite the ask a Reviewer judged, only move it out of
-- `pending`. "A Reviewer cannot modify a Request" is therefore a database
-- fact, not a promise the application code keeps on its own.
GRANT UPDATE ("state") ON "request" TO dds_app;
