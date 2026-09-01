# DDS Sharing

A web application for requesting de-identified case-level extracts of Thai DDC (กรมควบคุมโรค) D506 epidemiological surveillance data. Every request is reviewed by a named human before any data is fetched.

## Language

### People

**Requester**:
The person filling in the request form. Intended audience is epidemiologists at DDC and the regional offices (สคร.). Not authenticated and never verified by the system.
_Avoid_: User, client, applicant

**Reviewer**:
The person in the operating organisation who checks a Requester's identity and approves or rejects their Request. Authenticated, named, and accountable for each release. A Reviewer is never removed — only deactivated — because their name stays on every Decision they made. At least two must be **reachable** at any time: one Reviewer is the other's only recovery path.
_Avoid_: Admin, approver, moderator

### The request

**Request**:
A Requester's parameterized ask — one disease group, one inclusive date range of at most 365 days, and an optional single area — together with the contact details they supplied.
_Avoid_: Query, job, application

**Decision**:
A Reviewer's approve-or-reject act on a Request, carrying the Reviewer's identity, a timestamp, and (on reject) an internal note never shown to the Requester.
_Avoid_: Approval, review, verdict

**Workplace**:
The free-text organisation a Requester names for themselves. An input to the Reviewer's human judgement, never a credential and never validated.

### The data

**Extract**:
The generated CSV — de-identified case-level rows, one flat file, zipped. Has its own lifetime, delivery, and expiry, distinct from the Request that produced it.
_Avoid_: Export, download, dataset, report

**Probe**:
A single `page_size=20` upstream call made at submit time, per date-chunk, purely to read exact `meta.total_items`. It gives the Reviewer a row count to judge against and sizes the queue; it fetches no data for the Extract.

**Download token**:
The unguessable, time-limited capability that lets a Requester collect one Extract. Carried in the delivery email, never shown on a page. Expires 72 hours after the extraction job completes and is never extended by use. Not single-use — time-limited and attempt-capped instead.
_Avoid_: Download link, magic link, signed URL

**Attempt**:
One presentation of a Download token, counted whether or not the transfer completes. Capped at 10 over the token's life. Every attempt is audited; the cap is a backstop against a token that reached somewhere public, not the control.
_Avoid_: Download, try, hit

**Delivery**:
The one email that carries a Download token to a Requester. Distinct from the system's other emails (Reviewer queue notification, rejection, extraction failure) because it is the only one whose arrival can be inferred from behaviour — and the only one a Download token depends on.
_Avoid_: The email, notification, dispatch

**Send failure**:
The relay refusing or failing to accept a message the system tried to send. Observable within seconds and caused by the system's own configuration or the relay's health, never by the recipient. The system retries, then abandons.
_Avoid_: Bounce, delivery failure, email error

**Collection lapse**:
A delivered Extract that the Requester has not collected — no Attempt on its Download token — after 24 business hours. Inferred, never observed: the system cannot see whether the Delivery arrived, so silence is the only signal it has. A lapse is a suspicion that the email went missing, not proof of it.
_Avoid_: Failed delivery, undelivered, bounce, no-show

**Area selection**:
A Request's optional single choice of national (the default), one province, or one health region (`เขตสุขภาพ`, 1–13). A region is expanded server-side into its province list before the Request is stored, so a stored Request names provinces and never a region.

**Duplicate suppression**:
The rule rejecting a submit from an IP that already has an unfinished Request. Deliberately not called a rate limit: it catches page refreshes, not adversaries, and belongs to UX rather than security.

### The record

**Request event**:
One immutable entry in the Request's history — an occurrence, an actor, and a moment. Never edited and never deleted; a correction is a further event citing the one it corrects. The Request's own state is a projection of its events, not a separate truth.
_Avoid_: Log entry, audit row, history record

**Reviewer event**:
One immutable entry in a Reviewer's own history — a sign-in, a failed sign-in, a deactivation. Kept apart from Request events because it belongs to a person rather than to a Request, and it accumulates whether or not any Request was ever decided.

**Actor**:
Whoever or whatever caused a Request event. One of four kinds: a Requester (known only by network origin), a named Reviewer, the system itself, or an anonymous presenter of a Download token. The kind is part of the record, so "which human did this" is never a guess.

**Snapshot**:
The copy of what a Reviewer had on screen, carried by their Decision — the disease group, the dates, the Area selection, the Probe row count, and the Workplace. Never the contact details. It makes a Decision legible on its own, years later.

**Extract fingerprint**:
The description of a released Extract that outlives the Extract itself — row count, column count, size, and a checksum. It answers what was released, where the record alone would only say that a release happened. The rows are never kept.
_Avoid_: Manifest, receipt

**Redaction**:
The manual removal of one Requester's contact details, performed on the host by a named operator. It is a courtesy to someone who asks, never an automatic expiry, and it is itself recorded as a Request event.
_Avoid_: Erasure, purge, deletion
