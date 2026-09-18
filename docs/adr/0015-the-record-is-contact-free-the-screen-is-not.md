# 15. The record is contact-free, the screen is not

Date: 2026-09-18

## Status

*Amended by [ADR 0019](0019-a-requesters-contact-details-are-never-removed.md):
contact details are never removed on request, so the first Consequence below now
describes only when they leave the Reviewer's screen, and the removal request the
alternatives mention can no longer be made. The decision below is unchanged.*

*Amended (ticket #61): the `mail_sent` event carries the address it was sent to,
as spec §12.4 always said. The Decision section now names that one exception.*

Accepted. Clarifies §12.3 and §10.9. **Reconstructed**: an ADR of this number and
title was written earlier and was lost when the repository was reverted to its
initial state; this is written fresh from the rules the spec already carries, not
recovered from that commit.

## Context

§12.3 says the **Decision Snapshot** copies the Disease group name over its Report
codes, the date range, the Area selection, the Probe row count and `workplace` —
and that it **does not copy the contact fields**. The Snapshot exists to make a
Decision legible on its own years later, and a record that must survive
indefinitely is the wrong place to keep a second copy of a named person's
telephone number and email address.

That rule is about the **record**. Read as a rule about the **service**, it breaks
the one thing a Reviewer is asked to do after a Decision.

§10.6 assigns a **Collection lapse** to the approving Reviewer by name, because the
act is *"telephone the Requester you personally vouched for"*. A **Send abandoned**
Alert is the same act. Neither is possible from a Snapshot: the Snapshot has no
telephone number in it, deliberately. The contact fields live on the Request, in
their own table, and that is where the screen must read them from.

Nothing in the spec said so. An implementer who reads §12.3 and applies
*contact-free* to the Reviewer surface builds a screen where the must-clear Alert
says *phone this person* and the number is not on it.

## Decision

**The Snapshot never copies the contact fields. The Reviewer screen reads them
live from the Request, and shows all five, for as long as the Request is in
flight.**

- In flight means approved and not yet terminal (§10.9). A Request being chased is
  always in flight, so the number is always there when the act requires it.
- Any active Reviewer sees them, not only the approving one. Alerts widen on
  deactivation ([ADR 0013](0013-deactivating-a-reviewer-widens-their-alerts.md))
  and a number only one person can read rebuilds the failure that ADR removed.
- They are read, never copied. No Decision or Snapshot carries them, and no event
  does either, with one exception: **`mail_sent` carries `to`** (spec §12.4), the
  address a mail was sent to. That is the answer to "where did this Delivery go?",
  which the record must give years later; it is one address per mail, not the five
  contact fields.

## Consequences

**The record and the screen age differently, and that is the point.** Contact
details can be removed on request by telephone once a Request is finished, and
that removal takes them off every screen without touching a single Decision. Had
the Snapshot copied them, honouring that request would mean editing the audit
record, which §12 forbids outright.

**A Decision read in 2035 shows what was judged and not who was called.** The
judgement was about identity, so the record has to show the *ask* and the
Reviewer's name; it does not have to show a stranger's mobile number to be
legible.

**A terminal Request stops showing contact details on the queue**, because it
leaves the Reviewer surface (§10.9). Anyone who needs them afterwards goes to the
database, which is a deliberate speed bump rather than an obstacle.

## Alternatives rejected

**Copy the contact fields into the Snapshot.** Makes the audit record a permanent
second store of personal data, and makes the retention promise unkeepable: the
only way to honour a removal request would be to rewrite an append-only record.

**Show contact details only to the approving Reviewer.** Rebuilds the stranding
that ADR 0013 was written to remove. The two-person minimum is two *reachable
people*, and a lapse whose telephone number is visible to one of them is a lapse
that waits for their return.

**Hide contact details once a Decision is made.** Exactly inverts the need: the
Decision is when chasing starts, not when it ends.
