# 15. The record is contact-free; the Reviewer's screen is not

Date: 2026-09-09

## Status

Accepted. Amends §10 with the in-flight list, and amends #74. Found while
triaging the post-Decision Reviewer surface: #74 gives a Reviewer a Re-run
button and two kinds of resend, and nothing in §10 said where those buttons
live or what is on the screen around them.

## Context

Two rules in this service both concern contact details, and they are easy to
read as one rule.

The first is about the **record**. A Snapshot carries the Disease group's name
over its Report codes, the dates, the Area selection, the row count and the
Workplace — and **never the contact details**. That is deliberate: the Snapshot
exists for a reader in year five, who needs to see what was released and on what
judgement, and who has no business holding a named person's telephone number to
learn it.

The second is about the **screen**. §10.2 already puts all five contact fields
in front of the Reviewer at the moment of the Decision, because two of them —
the name and the Workplace — *are* the judgement, and because §10.3's telephone
call has no other source for the number.

Nothing said what happens to the second rule after the Decision lands. It
matters because both of the Reviewer's remaining acts on a Request need those
fields:

- **Clearing a Collection lapse** is *"phone the Requester you personally
  vouched for"* — the telephone number, hours or days after the Decision.
- **A resend to a corrected address** must show which address it is correcting
  *from*, and the corrected-address path is a new Decision precisely because the
  recipient changed.

Reading the Snapshot's rule as the screen's rule breaks both. A Reviewer holding
an open Alert would have a task and no way to perform it.

Restricting the fields to *only* while an Alert is open was considered and
rejected. The **same-address resend has no Alert behind it** and still has to
name the address it is resending to, so that rule either forbids a capability
#74 grants or leaks the field through a special case — a distinction with no
protective value.

## Decision

**The contact-free rule governs the record, not the screen.** A Reviewer reads
the five live contact fields — from the Request, never from the Snapshot — for
as long as the Request is **in flight**, and they leave the surface with it when
the Request goes terminal.

The Snapshot's own rule is unchanged: it still carries no contact detail, and no
Decision, event payload or fingerprint gains one.

The two rules protect different people. The record's rule protects the Requester
from a permanent, widely-readable copy of their details. The screen's rule
protects nobody — hiding a telephone number from the one Reviewer holding the
task that needs it is theatre, and the fields are already in front of that same
Reviewer at the moment they take responsibility for the release.

## Consequences

**The window has an end, and it is the one Redaction already assumed.** Contact
details are visible while in flight and gone from the Reviewer surface
afterwards, which is roughly when Redaction becomes available — the two rules
now describe the same boundary instead of two unrelated ones.

**Accepted: any active Reviewer can read any in-flight Request's contact
details, not only the approving one.** That follows from the in-flight list
being everyone's, which follows in turn from
[ADR 0013](0013-deactivating-a-reviewer-widens-their-alerts.md)'s finding that
work only one person can reach is work that waits for them. ADR 0013 already
recorded that the telephone number is not the personal part — the judgement is.

**Watch for.** An implementer who has internalised *"the Snapshot never carries
contact details"* will read the in-flight screen as a leak and try to fix it.
It is not: the screen reads live fields, and the record still keeps none.
