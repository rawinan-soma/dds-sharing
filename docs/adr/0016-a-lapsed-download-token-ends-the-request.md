# 16. A lapsed Download token ends the Request

Date: 2026-09-18

## Status

Accepted. Makes explicit a rule §11.5 and §10.9 already imply. **Reconstructed**:
an ADR of this number and title was written earlier and was lost when the
repository was reverted to its initial state; this is written fresh from the
rules the spec already carries, not recovered from that commit.

## Context

A Download token expires **72 hours after the extraction job completes**, is never
extended by use, and is never extended by a same-address resend (§9.3, §10.8). If
nothing collects it, the Request reaches `expired_uncollected`, which §11.5 makes
a distinct terminal state because *"a Request would otherwise end identically
whether the Requester collected the Extract or never saw the email"*.

What the spec did not say is what a Reviewer may do about it afterwards. The
sympathetic case is easy to imagine and easy to build: an officer who was on leave
calls to say they missed the link, and a Reviewer who has already approved them
presses Re-run.

That case is exactly the one to refuse. The Reviewer would be releasing data on
the authority of a Decision whose own clock has run out — and doing it on a
telephone call from someone whose identity was verified once, days ago, in a
different week's context. Nothing about the original approval was wrong; it has
simply expired, in the same way the link did.

Meanwhile the Requester already has the cheap remedy, and it costs them one form.

## Decision

**A lapsed Download token ends the Request. No Reviewer action revives it, and
there is no grace window.**

- `expired_uncollected` is terminal. A terminal Request is not in flight, so it
  carries no actions at all: no resend, no Re-run (§10.9).
- The Requester **resubmits and is judged afresh** — possibly by a different
  Reviewer, possibly to a rejection.
- The expiry page says so in one sentence and offers the telephone number. It
  does not offer to re-send, and it carries no reference number
  ([§9.4](../spec.md)).

## Consequences

**The cost is accepted knowingly.** A Requester who was ill, on leave, or whose
mail provider filed the Delivery in junk must fill the form again, and a second
Decision may go the other way. That is a worse experience than a grace window
would give them.

**The alternative is worse: an approval whose authority outlives its own clock.**
Once a Reviewer may revive a lapsed release, the 72 hours stop being a retention
bound and become a default that is negotiable by telephone — and the negotiation
happens with no identity check, because the caller is already known.

**The lapse count stays honest.** `expired_uncollected` is *"the only number that
measures whether email is working"* (§11.5). A revival path would quietly convert
those failures into successes and remove the service's only evidence that
delivery is broken.

**Do not add a grace window later.** It is the single most likely "small kindness"
to be added by someone who has not read this, and it silently undoes the
retention bound.

## Alternatives rejected

**A short grace window, for example 24 hours, that a Reviewer may grant once.**
Moves the bound rather than holding it, and makes the real expiry 96 hours for
anyone who asks. It also puts a Reviewer in the position of deciding who deserves
an extension, which is a judgement the service never asked them to make.

**Re-run on a terminal Request.** Technically trivial and semantically wrong: a
Re-run is *not* a new Decision (ADR 0012) precisely because nothing but the clock
changed. Here the clock is the thing that ran out.

**Automatic reissue on a late Attempt.** A presentation after expiry is exactly
the signal that the link leaked or was forwarded. Reissuing on it would reward
the one event that should be audited most closely.
