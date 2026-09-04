# 4. Personal data about staff is retained indefinitely

Date: 2026-09-02

## Status

Accepted. Completes the half of the PDPA position that ADR-adjacent issue #22
does not reach: #22 argues the *Extract* is non-personal data, which says
nothing about the people who ask for it or approve it.

## Context

This service destroys the patient-derived Extract 72 hours after it is produced
(#9), and it never stores surveillance data at rest. Its safety argument has
been, throughout, that data does not linger.

That argument covers surveillance data only. Four separate bodies of personal
data accumulate permanently on the other side of the system, all of them about
identifiable people:

- **Contact data** — a Requester's name, surname, telephone number, email
  address and workplace (#10).
- **Network data** — IP address and user agent on request events, and on every
  presentation of a Download token, including presentations that match no
  Request at all (#5, #10).
- **Accountability data** — the Decision chain, the snapshot of what a Reviewer
  had on screen, and a Reviewer display name that stays resolvable for ever
  (#10, #18).
- **Staff performance data** — how long a Request waited before expiring, every
  Reviewer sign-in and failed sign-in, and whether a named Reviewer chased a
  missing Extract or a failed extraction (#10, #18, #19, #27).

A retention clock was proposed three times — on #10 as two clocks (contact ~1
year, accountability ~10 years), and twice more on #28 as a per-class scheme.
It was declined all three times.

## Decision

**Nothing is ever deleted.** All four bodies are retained indefinitely, on the
ground of **auditing and traceability of data releases**. The lawful basis is
**legal obligation and legitimate interest**, not consent — a Requester who
withdrew consent could erase the record of a release that actually happened,
which is the one thing an audit record must survive.

The consequence is stated rather than buried: **the patient-derived Extract is
destroyed after 72 hours; the epidemiologist's telephone number is kept for
ever.**

## Consequences

**The audit record needs no exception to remain one.** #10 grants the
application role `INSERT` and `SELECT` and grants `DELETE` nowhere. Every
retention scheme considered required punching a hole in that guarantee — a
scheduled job holding a deletion role, a narrowed grant on the contact table,
or per-Request encryption keys. Keeping everything is the only option under
which "the running application cannot rewrite history" stays literally true.

**"Data does not linger" is now a claim about surveillance data only.** Any
statement of it without that qualifier is wrong.

**The longest-lived personal data in the system is about strangers.** Failed
Download-token lookups record the IP addresses of people who never used the
service and are not staff. This was the one class where a clock was still
argued for after the decision, and it is retained deliberately: a token-guessing
sweep is only visible in hindsight, so a one-year clock deletes exactly the
evidence the investigation would want. It is a trace of an attack rather than of
a release.

**Redaction survives as a bounded courtesy, and is not a retention rule.** A
Requester who asks can have their contact row cleared by a named operator on
the host, recorded as an event. It never touches the Decision chain, the
snapshot, or Reviewer records; it is unavailable while a Request is in flight;
and a Reviewer cannot be redacted at all, because their name on a release is the
accountability record. There is no automatic trigger, and the specification must
not present it as one.

**Both populations are told, on a surface they see.** The Requester gets one
Thai sentence at submit — what is kept, that it is indefinite, why, and that
redaction can be requested. Reviewers are told at account seeding and once at
first login, because they never see the submit form and the specification is
read by implementers rather than by them.
