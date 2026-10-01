-- #102: duplicate suppression matches email and ask, not IP (spec §4.8), so
-- nothing asks "which Requests came from this IP" any more. The IP stays on
-- the `submitted` event for the audit record.
DROP INDEX "request_event_submitted_ip";
