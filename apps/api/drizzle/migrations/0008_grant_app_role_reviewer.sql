-- Reviewer accounts and sign-in (spec §17.5, ticket #64). `app_role` runs the
-- sign-in flow, so it needs to read the full `reviewer` row — but its write
-- access is column-scoped to exactly the fields a live session can change
-- about itself (password change, TOTP confirmation, replay tracking, the
-- forced-change flag). It never gets INSERT, DELETE, or UPDATE on
-- `username`, `display_name`, `email`, `totp_secret`, or `deactivated_at`.
-- Seeding a Reviewer, deactivating one, and CLI-driven password/TOTP resets
-- are a ceremony run with shell access to the Docker host, deliberately
-- outside what a compromised application connection could do on its own —
-- all three go through the unrestricted DATABASE_URL role, the same one
-- migrations use.
GRANT SELECT ON TABLE "reviewer" TO app_role;
--> statement-breakpoint
GRANT UPDATE ("password_hash", "must_change_password", "totp_confirmed_at", "totp_last_used_step") ON TABLE "reviewer" TO app_role;
--> statement-breakpoint

-- Sessions and throttle state are app_role's own working state (spec §17.5:
-- "Sessions and throttle state live in Postgres, not Redis") — the app reads,
-- writes and deletes them as it manages sign-ins, sliding expiry, eviction of
-- the oldest of 3 concurrent sessions, and backoff bookkeeping.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reviewer_session" TO app_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "reviewer_login_throttle" TO app_role;
