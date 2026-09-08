# 12. A Re-run revokes the previous Download token, at ready

Date: 2026-09-08

## Status

Accepted. Amends §10.7, §12.4 and the Download token's definition in
`CONTEXT.md`. Amends FR-21 and FR-26. Found by the Request-lifecycle prototype
(`prototype/request-lifecycle`), which reached a state with two live Download
tokens for one Request and no rule saying whether that was intended.

## Context

§10.7 fixes what a **Re-run** creates — a fresh Extract, a fresh Download token, a
fresh 72-hour clock — and says nothing about what it retires. §10.8 is explicit in
the neighbouring case: a corrected-address resend **revokes** the old token,
because *"the first address may be a stranger's mailbox."*

The silence therefore reads as an omission rather than a decision, and it is
reachable: when the first extraction succeeded and its token is still live, a
Re-run leaves **two collectable Extracts for one Request**, each expiring on its
own clock. The Requester holds two emails with two links, the older of which dies
first — so the link most likely to be clicked is the one most likely to be dead,
while a live one sits in another message.

The collision only arises from a **successful** first run. After an Extraction
failure there is no first token; after `expired_uncollected` it is already dead.

Two live tokens are not a disclosure problem — same Request, same Decision, same
recipient, so §10.8's stranger's-mailbox argument does not apply. They are a
**correctness and legibility** problem: *"which Extract did they collect?"* stops
having one answer, and a superseded Extract stays reachable after something better
exists.

Refusing the Re-run while a token is live — and directing the Reviewer to Resend
instead — was considered and rejected. It reads well against §10.8's boundary
(Re-run is for when there is no usable Extract; Resend is for when the Extract is
fine but the email went astray), but it forbids a legitimate case: re-extracting to
pick up cases notified since the first run, or after reference data was corrected.
**In exactly that case the superseded Extract is the one you most want revoked**,
which the refusal cannot do.

## Decision

**A Re-run revokes the previous Download token at the moment the new Extract is
ready.** One Request never has two collectable Extracts.

**At *ready*, not at the press of the button.** Revoking when the job is queued is
simpler to implement and strictly worse: it opens a window in which an approved
Request has no collectable Extract at all, and if the re-run then fails it has
destroyed a good Extract to replace it with nothing.

The machinery already exists: `download_token_revoked` is in the closed event
catalogue for the corrected-address case, and this is its second writer.

## Consequences

**A failed Re-run now costs the Reviewer nothing.** The original Extract stays
collectable until there is something better to replace it, so pressing the button
is never a gamble against a working Extract.

**`download_token_revoked` gains a `system` actor.** The corrected-address case is
written by a Reviewer at the moment they act; this one is written by the job at
completion, minutes after the Reviewer pressed anything. The event carries which
Re-run superseded it.

**The superseded object is deleted on the ordinary schedule** rather than lingering
until its own 72 hours lapse. `object_deleted` records it as usual.

**Accepted: a Requester holding the first email loses a link that worked a moment
ago.** They may click it and reach the expiry page while a newer, live link sits in
a later email. This is the cost of the rule and it is the right way round — the
alternative leaves them collecting data the service has already superseded. The
expiry page is deliberately identical in every case (§9.4) and cannot explain
which of the four states it is in, so this is genuinely indistinguishable to them
from an ordinary expiry.

**Unchanged: a same-address Resend still moves nothing.** It reuses the live token
and does not touch the clock. Only a *corrected-address* resend and a Re-run revoke.
