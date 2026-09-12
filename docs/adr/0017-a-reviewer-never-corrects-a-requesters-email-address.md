# 17. A Reviewer never corrects a Requester's email address

Date: 2026-09-12

## Status

Accepted. Amends §10.8, §10.9, §12.4 and the Download token's definition in
`CONTEXT.md`. Amends #74. Amends
[ADR 0012](0012-a-re-run-revokes-the-previous-download-token.md) and
[ADR 0015](0015-the-record-is-contact-free-the-screen-is-not.md), both of which
lean on the corrected-address case this removes. Found while reconciling the
design handoff against §10: the handoff's Reviewer surface offered two actions
on a decided Request where §10.8 specified three, and the missing one turned out
to be the one worth arguing about.

## Context

A Requester types their own email address into a form that never validates it
and never verifies it. `requester_email_warning` exists because of this: it is
the only place a Requester is told that a typo will not be caught. The Extract
archive is delivered to that address and nowhere else.

So the typo is real, it is foreseeable, and the service is designed to tell the
Requester about it in advance. §10.8 went one step further and gave a Reviewer a
remedy: **resend to a corrected address**, framed as a new Decision — a fresh
Download token, a fresh 72 hours, the old token revoked, and an audit entry
naming both addresses.

The framing was careful and the machinery was sound. The question nobody had
asked is whether the remedy should exist at all.

To correct a typo, a Reviewer must type the new address by hand. There is
nothing to constrain it to. The Requester is unauthenticated, the Workplace is
free text that is never checked against a list, and the service holds no
directory of DDC addresses. The nearest available control is a domain allowlist,
which fails on the case it exists for: an officer on a `gmail.com` address is
already approvable today, so an allowlist blocks the legitimate correction while
stopping nobody who means harm — a `go.th` address is not hard to come by.

That leaves free-hand entry, and free-hand entry means one Reviewer, alone, can
direct case-level personal data to any mailbox on the internet. The controls
would be a confirmation dialog and an audit entry: both real, both after the
fact, and neither a second pair of eyes.

Against that: **the service already has an answer for a Requester who loses
their Extract, and it is not a Reviewer's button.**
[ADR 0016](0016-a-lapsed-download-token-ends-the-request.md) ruled that a
Download token expiring uncollected ends the Request, that no Reviewer action
revives it, and that the Requester submits again and is judged afresh. A
mistyped address is the same shape of loss and was being given a different
answer.

## Decision

**There is no resend to a corrected address, and one must never be added.** A
Reviewer's resend goes to the address on the Request, or it does not happen.

A Requester who mistypes their email address has ended their Request. They
submit the form again and are judged afresh, exactly as a Requester who missed
their 72 hours does.

**A Reviewer decides *who* gets data. A Reviewer never decides *where* it
goes.** That is now true without exception, which is what §10.8's boundary was
always reaching for.

## Consequences

**`download_token_revoked` drops to a single cause and a single actor.** Only a
Re-run whose new Extract is ready revokes a token, written by the job with a
`system` actor. ADR 0012 described the corrected-address case as the event's
first writer and this as "its second"; there is now one writer. ADR 0012's
closing line — *"Only a corrected-address resend and a Re-run revoke"* — reads
as Re-run alone.

**`download_token_reissued` leaves the event catalogue entirely.** Nothing
raises it. §12.4 keeps a closed catalogue, and this is the removal that keeps it
honest rather than carrying a type no code can write.

**ADR 0015 keeps its conclusion and loses one of its two reasons.** The
Reviewer's screen still shows the five live contact fields while a Request is in
flight, but now on the strength of the Collection lapse case alone — telephoning
the Requester you personally vouched for — plus the same-address resend needing
to name the address it is sending to. The corrected-address justification is
gone; the rule it justified is not.

**`requester_email_warning` becomes the only protection, and it is load-bearing
rather than advisory.** It is now the single thing standing between a Requester
and a silently lost Extract. It must stay above the form, and its copy must
survive translation with its force intact.

**Accepted, and it is the real cost: a Requester who mistypes gets nothing and
is told nothing.** No Delivery arrives, no bounce is read — `mail_bounced` does
not exist and never will — and no Alert fires, because a Collection lapse is
raised by silence and this looks exactly like silence. They wait out a
24-business-hour decision promise, then a 72-hour collection window, and learn
only by not hearing. They then resubmit and may be refused, with no reason
given. This is paid by the person least able to see why, and it is the same
price ADR 0016 already accepted for a different route to the same place.

**The Reviewer surface has no action that changes a recipient.** Every remaining
capability — Re-run, same-address resend — reproduces a release that a Decision
already covered. This is what makes the whole surface safe to leave in the hands
of any active Reviewer rather than only the approver (§10.9).

**Watch for.** *"Just let the Reviewer fix the address, it is one field"* is the
obvious next suggestion, and it will arrive attached to a sympathetic real case:
a named officer, an obvious typo, a Reviewer who can see exactly what was meant.
It is still a release to a recipient no Decision covered, and this ADR is the
answer.
