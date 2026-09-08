# 14. A Re-run defers its Alert rather than clearing it

Date: 2026-09-08

## Status

Accepted. Amends §10.6, §10.7 and §12.4. Amends FR-25 and FR-26. Found by the
Request-lifecycle prototype (`prototypes/request-lifecycle.prototype.html`), where one broken
promise produced one `re_ran` outcome and one still-open Alert.

## Context

§10.6 clears an **Extraction failure** Alert with one of three outcomes:
`re_ran` / `contacted_requester` / `abandoned`. **`re_ran` is not an outcome. It is
an action whose outcome nobody knows yet.**

Driving the prototype: a Reviewer clears the Alert as `re_ran`, presses the button,
and the second job fails too. That raises a second Alert. **One broken promise now
reads as one `re_ran` plus one open item.** Re-run again and it reads as two
`re_ran` and still nobody has an Extract. §10.6 says the count of each outcome is
*"the only measure this service has of how often its silent failures actually
happen"* — and as written, that count measures button presses.

The correct shape is already in the spec one row above. A late collection clears
its Collection lapse as actor **`system`, never `reviewer`**, because *"no one gets
credit for a call they did not make, and the lapse count must stay honest."* The
same principle applies here and was not applied.

## Decision

**Pressing Re-run defers the Extraction failure Alert. It does not clear it.**

- The Alert **stays on the queue** while the new job runs, marked as re-running.
- If the job **completes**, the system clears the Alert itself, actor **`system`**,
  outcome `re_ran`.
- If the job **fails**, the Alert **stays open** and records a second attempt. No
  second Alert is raised.
- The Reviewer-chosen outcomes shrink to **`contacted_requester` / `abandoned`**.

**One Alert per broken promise, not one per job.**

## Consequences

**`extraction_alert_cleared` gains a `system` actor**, which the catalogue already
permits for `collection_lapse_cleared`. No new event type: §12.4 stays closed.

**The outcome counts now mean what a reader will assume they mean.** `re_ran`
counts re-runs that produced an Extract. `abandoned` counts promises the service
gave up on. Neither counts a button.

**A repeatedly failing job no longer inflates the record.** Three attempts against
one unchanged cause read as one Alert carrying three attempts, rather than three
Alerts and two `re_ran` outcomes. The `job_failed` events carry the causes; the
Alert carries the promise.

**Accepted: the Alert sits on the queue for minutes longer.** It now clears itself
when the re-run works, rather than the moment the Reviewer pressed the button.
Against a worst case of ~35 seconds (ADR 0008) this is not queue noise, and the
Reviewer does less work rather than more — they name an outcome only when they are
the one who resolved it.

**A Reviewer who re-runs and then walks away is no longer a gap.** Previously the
Alert was already cleared, so a failed re-run depended on a fresh Alert being
raised and noticed. Now the original item never left the queue.
