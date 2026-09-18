# 17. A Reviewer never corrects a Requester's email address

Date: 2026-09-18

## Status

Accepted. **Reverses** `docs/spec.md` §10.8's corrected-address branch, removes
`download_token_reissued` from §12.4's closed event catalogue, narrows
`download_token_revoked` to a `system` actor, and rewrites SRS FR-27. Amends
`CONTEXT.md`'s definition of **Download token**. Decided with the repo owner on
2026-09-18.

**Reconstructed**: an ADR of this number and title was written earlier and was
lost when the repository was reverted to its initial state. This is written fresh
and re-decided, not recovered from that commit.

## Context

§10.8 let a Reviewer resend a Delivery to a **corrected** address, and guarded it
by calling that act a **new Decision**: a fresh Download token, a fresh 72 hours,
the old token revoked, and both addresses named in the audit entry. The reasoning
was symmetry with §10.7 — a Re-run is not a new Decision because nothing changed
but the clock; a corrected-address resend is one, because the recipient changed.

The guard is weaker than it reads. The "new Decision" is made by the same Reviewer
who made the first one, in the same sitting, usually during the telephone call
that reported the problem. Nothing external is consulted and no second person is
involved. It is a formality performed by the person it is meant to check.

What it authorises is not small. A Requester's email address is **never verified**
by this service — §16.4 says so on the form, in the one place a Requester is told
that a typo will not be caught. So a corrected address is not a correction of a
known-good value; it is a **new, unverified destination for case-level data**,
supplied over the telephone by a caller whose identity was checked once, earlier,
and is now being taken on trust because they are already known.

That is a different power from the one the approval gate delegates. The gate asks
a Reviewer one question — *does this person exist today, and do they work at the
Workplace they named?* (ADR 0007). It does not ask where the data should go. The
answer to *who* was designed to be checkable by telephone against a workplace; the
answer to *where* is checkable against nothing.

The affordance also misreads as clerical. A field beside a resend button looks
like fixing a typo, and nobody reviews a typo fix as a data release.

## Decision

**A Reviewer never corrects a Requester's email address. The resend control takes
no address field.**

- Resend sends the **same** Delivery to the **same** address, or it does not send.
  It remains free, audited, and never moves the 72-hour clock.
- A Requester who mistyped their own address has **ended their Request**, exactly
  as one who missed their 72 hours has
  ([ADR 0016](0016-a-lapsed-download-token-ends-the-request.md)). They resubmit
  and are judged afresh.
- **`download_token_reissued` is removed from the event catalogue.** It had one
  cause and that cause no longer exists. A type that can never be written is a lie
  in the schema, the same argument §11.1 uses to refuse `mail_bounced`.
- **`download_token_revoked` narrows to a `system` actor.** Its only cause is a
  Re-run whose new Extract is ready (§10.7, ADR 0012). A Reviewer cannot revoke a
  token.

**A Reviewer decides who receives data, never where it goes.**

## Consequences

**A Requester who mistypes their address pays for it with a second form.** They
are told on the form that this will happen, in `requester_email_warning`, which is
the only place the service admits a typo tells nobody. That notice is now
load-bearing: it is the entire remedy.

**The service loses its only means of rescuing a delivery that went to a
stranger's mailbox** — and gains the guarantee that it can never send one there on
a Reviewer's say-so. The first address stays live until it expires, because
nothing revokes it. That is uncomfortable and it is the honest consequence: the
disclosure already happened when the Delivery was sent, and a second release
cannot undo it.

**This is the absence most likely to be "fixed".** A resend button with no address
field looks like an oversight, and the fix looks like two lines of template. It
must be defended in review. The design states it on screen as a stated absence
rather than leaving it invisible, and the Reviewer surface carries the sentence
*"A Reviewer decides who receives data, never where it goes."*

**§10.8's mirror with §10.7 collapses, and reads better for it.** Neither a Re-run
nor a resend is a new Decision, because neither can change anything a Decision was
about.

**One closed catalogue shrinks.** Removing an event type is a migration and a spec
change, and this ADR is the record of it.

## Alternatives rejected

**Keep §10.8 as written.** Its guard is a formality performed by the person being
guarded, and the value it protects — an unverified address — was never verified in
the first place.

**Require the *other* Reviewer to approve a corrected address.** Genuinely
stronger, and rejected on availability: the two-person minimum is two *reachable
people*, and a data release that waits for the second one is a release that waits
for their leave to end. It also keeps a redirect capability in the system for the
rare case, which is exactly how such capabilities survive to be misused.

**Let the Requester correct their own address** from a link in the Delivery.
Impossible by construction: the Delivery went to the wrong address, so the link
went with it.

**A confirmation step on the address before submit.** Considered and left to the
form's own design rather than this decision. It would reduce typos; it cannot make
an address verified, and this ADR is about what a Reviewer may do afterwards.
