# 13. Deactivating a Reviewer widens their open Alerts, and never rewrites them

Date: 2026-09-08

## Status

Accepted. Amends §10.6 and §12.4. Amends FR-25 and FR-29. Found by the
Request-lifecycle prototype (`prototype/request-lifecycle`), which reached a
must-clear Alert that no living person could clear.

## Context

§10.6 assigns a **Collection lapse** to the approving Reviewer **by name, and to
nobody else**, because the act is *"phone the Requester you personally vouched
for"*. A **Send abandoned** Alert follows the same rule. Only two things clear a
lapse otherwise: `system`, on a late collection.

`CONTEXT.md` says a Reviewer is **never removed, only deactivated**, because their
name stays on every Decision they made. FR-29 sets `deactivated_at` and
invalidates their sessions immediately.

Put those together and deactivating the approving Reviewer **strands their open
Alerts permanently**. In the prototype, the other Reviewer is refused because the
Alert is not theirs, and the assigned Reviewer is refused because they are
deactivated. A must-clear queue item that nobody can clear is a queue that never
goes quiet — and §10.6 is emphatic that an Alert is a must-clear item precisely
because a passive list is a list nobody looks at.

The by-name rationale is also thinner than it first appears. The telephone number
sits in the contact fields, which **any** Reviewer can read on the review screen.
What is genuinely personal is the **judgement** — and a deactivated Reviewer cannot
act on that either way.

FR-29 already refuses to take the count of active Reviewers below two without an
explicit `--force`, so this is not only a two-person-team edge case: it is reachable
whenever the approving Reviewer is the one who leaves.

Blocking deactivation while a Reviewer holds open Alerts was considered and
rejected outright. **Deactivation is frequently not voluntary** — a resignation, a
transfer, a loss of trust — and this would keep an account live at exactly the
moment the organisation wants it shut, in order to protect a queue item.

## Decision

**Deactivating a Reviewer widens who may clear their open Alerts to any active
Reviewer. It never rewrites who the Alert was assigned to.**

The name of the Reviewer who vouched stays on the Alert, consistent with a
Reviewer never being removed from the record. What changes is only the set of
people permitted to name an outcome.

**No new event type.** The widening is a pure function of the Reviewer's
`deactivated_at`, which the `reviewer` table already holds, so it is derived at
read time rather than announced. `collection_lapse_cleared` instead carries **both
the assigned and the clearing Reviewer**, exactly as `extraction_alert_cleared`
already does. §12.4's catalogue stays closed.

Reassigning to a *named* substitute was rejected: it needs an arbitrary picker rule
at any team size above two, and it overwrites the name of the person who actually
formed the judgement.

## Consequences

**The must-clear property survives.** The Alert stays on the queue until somebody
names an outcome from the closed set; only the eligible set grew. §10.6 already
accepts exactly this shape for an Extraction failure, on the same reasoning — *"an
alert only one person can clear is an alert that waits for them"*.

**Accepted: the outcome count loses a little meaning in this case.** A colleague's
*"could not reach the Requester"* is a weaker signal than the vouching Reviewer's,
because they never formed the judgement and never spoke to this person before. The
event records both names, so a reader can separate the two populations rather than
having to trust an average across them.

**The normal case is untouched.** While the approving Reviewer is active, a
Collection lapse remains theirs alone. This ADR changes nothing about the rule it
was written for; it only stops the rule outliving the person.

**FR-29's `--force` deactivation is no longer quietly destructive.** Taking the
service below two active Reviewers still breaks the recovery story the flag prints
about, but it no longer also freezes every Alert the departing Reviewer was
holding.
