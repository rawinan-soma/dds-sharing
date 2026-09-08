# 11. The Collection lapse trip-wire runs on wall-clock time

Date: 2026-09-08

## Status

Accepted. Rewrites §11.4; amends §10.6, §12.4 and §15.2. Amends FR-25. Found by
the Request-lifecycle prototype (`prototypes/request-lifecycle.prototype.html`), which drove the
timeline by hand and showed the Alert arriving after the Extract it concerned had
been deleted.

## Context

§11.4 raises a **Collection lapse** when a Delivery has been accepted by the relay
and **24 business hours** later the Requester has made no Attempt. §9.3 expires
the **Download token 72 wall-clock hours** after job completion. The two events
start within seconds of each other, because the Delivery is sent as soon as the
job completes.

The business-hours clock is Mon–Fri 08:30–16:30 (§15.2), so it advances **8 hours
per working day**. **24 business hours are therefore three working days, which are
exactly 72 wall-clock hours** on a week with no weekend in it. The arithmetic is
not close:

| Delivery accepted | Token expires | Lapse Alert raised |
|---|---|---|
| Monday 09:00 | Thursday 09:00 | Thursday 09:00 — the same instant |
| Friday 15:00 | Monday 15:00 | Wednesday 15:00 — **48 hours too late** |

§11.4 chose 24 business hours over waiting for the token's own expiry with an
explicit reason: waiting *"is useless — it fires as the window closes, leaving no
time to telephone."* **The business-hours trip-wire does the same thing, and on
any timeline containing a weekend it does it later.** The Reviewer is asked to
telephone a Requester about an Extract that no longer exists.

Lowering the threshold does not fix it. Eight business hours from a Friday 15:00
Delivery still lands on Monday 15:00, the exact moment the token dies, because the
weekend consumes 48 of the token's 72 hours while the business clock is stopped.
**A clock that stops cannot warn you about a clock that does not.** The defect is
that the two clocks are incommensurable, not that a number is wrong.

Extending the token was rejected: §9.3 anchors the 72 hours as a **retention**
property — how long case-level data sits at rest — and says in terms that the
remedy for a Requester who never sees the email is the lapse Alert and a telephone
call, *"not a longer clock"*.

## Decision

**The Collection lapse measures the Requester's silence in wall-clock hours, and
raises its Alert in business hours.** The two clocks do different jobs and are
deliberately no longer the same clock.

- **The trip-wire is 24 wall-clock hours** from the Delivery being accepted by the
  relay, with zero Attempts. It races the same clock the Download token races, so
  it can never again be lapped by it.
- **The Alert is raised at the next business-hours opening** if the trip-wire fires
  outside them. A trip-wire that fires at Saturday 15:00 raises its Alert at Monday
  08:30.

This is a **split of the one job §11.4 gave the business-hours clock into the two
jobs it was actually doing**. §11.4's stated reason for business hours is about the
queue — *"a queue full of weekend noise is a queue nobody reads"* — which is a
statement about **when a Reviewer is asked to act**, not about **how long a
Requester is given**. Only the first of those needs the business clock.

## Consequences

**The Alert now arrives while the Extract still exists**, which is the only
condition under which it is worth raising at all:

| Delivery accepted | Token expires | Alert raised | Time to telephone |
|---|---|---|---|
| Monday 09:00 | Thursday 09:00 | Tuesday 09:00 | 48 hours |
| Friday 15:00 | Monday 15:00 | Monday 08:30 | 6.5 hours |

**Accepted: more false positives.** A trip-wire at 24 wall-clock hours catches
Requesters who were merely slow more often than one at 24 business hours did.
§11.4 already accepts this class of error deliberately and prices it: *"That costs
one call. The alternative costs a completed extraction, an upstream slot, and a
Request that must be resubmitted and re-reviewed."* The price has not changed; only
the frequency has, and it buys an Alert that can be acted on.

**Accepted: a Friday-afternoon Delivery still gets a thin window.** 6.5 business
hours on a Monday morning is not generous, and it is the worst case rather than the
typical one. It is also the first arrangement under which that case gets **any**
window; the alternative was two days of nothing.

**§15.2 now serves two different callers for two different reasons.** Request
expiry (§10.4) counts *elapsed* business hours, because the 24-hour window is a
promise about Reviewer attention. The lapse uses the same clock only to answer
*"is anyone there to be told?"*. The section must say which caller is which, or a
later reader will re-unify them and reintroduce this bug.

**The `collection_lapse_raised` event gains the wall-clock elapsed time**, so a
reader can tell a trip-wire that fired on time from one whose Alert waited for
Monday.

**Unchanged: the lapse is still inferred, never observed.** Nothing here makes the
system able to see whether a Delivery arrived. Silence remains the only signal, and
a lapse remains a suspicion rather than proof.
