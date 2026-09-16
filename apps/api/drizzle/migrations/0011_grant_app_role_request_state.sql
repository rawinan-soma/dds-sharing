-- The Decision (spec §10.3, §10.4, ticket #66) — 0006's note said this grant
-- would be needed once something moved a Request off `pending`. It is
-- column-scoped to `state` alone: a Reviewer can approve or reject, never
-- modify a Request (§10.3 — "an editable Request breaks the audit chain"),
-- so app_role's write access here stays exactly as narrow as that rule.
GRANT UPDATE ("state") ON TABLE "request" TO app_role;
