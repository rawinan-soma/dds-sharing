-- §12.2/§12.3: app_role gets exactly what submitting a Request needs, no
-- more. INSERT/SELECT only on request and request_contact — no UPDATE, no
-- DELETE, which is what makes "a submitted request cannot be edited by
-- anyone" true at the database rather than by convention. This is also the
-- other half of 0004_grant_app_role_events.sql's note: request_contact was
-- created by this ticket (#63), and app_role's grant here is INSERT/SELECT
-- only — the eventual Redaction command still connects as admin_role and
-- still needs its own UPDATE grant added when that ticket lands, unwidened
-- by this one.
GRANT SELECT, INSERT ON TABLE "request", "request_contact" TO app_role;
--> statement-breakpoint

-- The reference-number counter is upserted (`INSERT ... ON CONFLICT DO
-- UPDATE`), so app_role needs UPDATE here too — the one table in this
-- migration that is not immutable, because it holds no Request data at all,
-- only a running count (§12.5).
GRANT SELECT, INSERT, UPDATE ON TABLE "reference_number_counter" TO app_role;
