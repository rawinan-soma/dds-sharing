# 16. A lapsed Download token ends the Request; an approval is never revived

Date: 2026-09-09

## Status

Accepted. Amends §10 with the in-flight list, and amends #74. Decided while
triaging the post-Decision Reviewer surface, alongside
[ADR 0015](0015-the-record-is-contact-free-the-screen-is-not.md).

## Context

The in-flight list gives a Reviewer a handle on an approved Request: while it is
in flight they can Re-run it and resend its Delivery. That raises a question the
specification had never had to answer, because until now nothing let a Reviewer
act on a decided Request at all.

A Download token expires **72 hours** after the extraction job completes, in
wall-clock time, and is never extended by use. When it expires uncollected the
Request is terminal, drops off the Reviewer surface, and the Re-run button goes
with it. The Requester — who may have been on leave that week — now has nothing,
and the Reviewer who vouched for them, and who was told about it by a Collection
lapse Alert at the 24-hour mark, has no button left.

The obvious kindness is a grace path: keep `expired_uncollected` re-runnable for
some window, on the existing Decision. It was considered and rejected.

The Decision is what authorises a release, and the 72 hours is the bound on that
authority — not a property of the link. A Request that can be re-extracted a
week later on last week's approval is an approval with no expiry, gated only by
whichever Reviewer is willing to press the button and by whatever window someone
picks. There is no principled length for that window: every argument for a week
is an argument for a month.

The service also already has a designed intervention *inside* the window. The
Collection lapse Alert fires at 24 wall-clock hours of silence and asks a named
Reviewer to telephone the Requester — with 48 hours still on the clock. That
Alert exists for exactly the person a grace path would be built for.

## Decision

**Terminal is terminal. A Request whose Download token expires uncollected is
finished, and no Reviewer action revives it.** The Requester submits the form
again and is judged afresh.

The same holds for a failure a Reviewer has abandoned: clearing the Alert with
`abandoned` ends the Request, and a later change of mind is a new Request, not a
re-run of the old one.

## Consequences

**Accepted, and it is a real cost: a Requester who missed the window is
re-judged, possibly by a different Reviewer, and could be refused for an ask
that was already approved once.** They also get no reason, because a rejection
never gives one. This is the price of an approval whose authority does not
outlive its own clock, and it is paid by the person least able to see why.

**The Collection lapse Alert is now load-bearing rather than advisory.** It is
the only intervention inside the window, so if it fires too late, or if the
72 hours is too short for the people actually using this service, the honest fix
is to change *those* — not to make approvals revivable. **A rise in Requests
resubmitted after an uncollected Extract is the signal to look at**, and it is
readable from the record: the same Requester, the same parameters, days apart.

**The in-flight list stays short and honestly bounded.** Its membership is
derived — approved, not yet terminal — and terminal now has a single meaning
with no revivable tail, which is what lets the list be a statement of
outstanding work rather than an archive.

**Watch for.** "Let the Reviewer re-run an expired one, it's harmless" is the
obvious next suggestion. It is not harmless — it converts a bounded release into
an open-ended one — and this ADR is the answer.
