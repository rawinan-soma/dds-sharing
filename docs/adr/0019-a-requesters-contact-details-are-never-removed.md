# 19. A Requester's contact details are never removed

Date: 2026-09-14

## Status

Accepted. Removes the Redaction that
[ADR 0004](0004-personal-data-is-retained-indefinitely.md) kept as a bounded
courtesy, and the Redaction boundary in
[ADR 0015](0015-the-record-is-contact-free-the-screen-is-not.md)'s
Consequences. Amends §12.2, §12.4 (`contact_redacted`), §12.8 (removed), §12.9
(the Requester's notice) and §17.3, and removes FR-28 from the derived SRS.
Decided while triaging #87, which asked what Actor kind a Redaction carries.

## Context

ADR 0004 decided that nothing is ever deleted, and then made one exception: a
Requester who asked by telephone could have their contact row cleared by a
command on the host, connecting as a separate admin role and writing a
`contact_redacted` event. It was bounded — never a Decision, never a Snapshot,
never a Reviewer, never while in flight — but it was still the one place where
data the application wrote could be changed afterwards, and the one reason a
database role with write access to `request_contact` had to exist.

## Decision

**There is no Redaction.** A Requester's contact details are kept indefinitely
with no exception, like the other three bodies of personal data in ADR 0004,
and on the same ground: auditing and traceability of data releases. A
Requester who asks to have them removed is refused, and is given that ground.
The Requester's notice at submit no longer offers removal.

## Consequences

**"Nothing is ever deleted" is now true without a footnote.** No role holds
`UPDATE` or `DELETE` on `request` or `request_contact`, so the admin role that
Redaction would have connected as has no remaining purpose.

**`contact_redacted` leaves the catalogue rather than staying unused.** §12.4
already says why, about `mail_bounced`: a type that can never be written is a
lie in the schema.

**The notice keeps three of its four parts** — what is kept, that it is kept
indefinitely, and why — and it is still shown before the Requester submits,
which is the only moment they can decide not to.

**In flight still ends the contact details' time on the Reviewer's screen**
(ADR 0015). It no longer gates anything else.

**Watch for.** The pressure will come as one real person asking politely, and
the tempting answer is a single `UPDATE` by hand. There is deliberately no
command and no role for it; this ADR is the answer.
