# DDS Sharing

A web application for requesting de-identified case-level extracts of Thai DDC (กรมควบคุมโรค) DDS epidemiological surveillance data. Every request is reviewed by a named human before any data is fetched.

## Language

### People

**Requester**:
The person filling in the request form. Intended audience is officers at DDC and the regional offices (สคร.). Not authenticated and never verified by the system.
_Avoid_: User, client, applicant

**Reviewer**:
The person in the operating organisation who checks a Requester's identity and approves or rejects their Request. Authenticated, named, and accountable for each release. A Reviewer is never removed — only deactivated — because their name stays on every Decision they made. At least two must be **reachable** at any time: one Reviewer is the other's only recovery path.
_Avoid_: Admin, approver, moderator

### The request

**Request**:
A Requester's parameterized ask — one Disease group, one inclusive date range of at most 365 days, and an optional single area — together with the contact details they supplied. A stored Request names Report codes, never a Disease group alone: the group is expanded at submit and the expansion is what a Re-run refetches.
_Avoid_: Query, job, application

**Decision**:
A Reviewer's approve-or-reject act on a Request, carrying the Reviewer's identity, a timestamp, and (on reject) an internal note never shown to the Requester. **The judgement is about who is asking** — identity, Workplace, legitimacy — **never about how much they ask for**: a large Request is slow, not illegitimate, and a long extraction completes rather than being refused. Size therefore never blocks or grounds a Decision, which is why nothing about a Decision waits on the Probe.
_Avoid_: Approval, review, verdict

**Workplace**:
The free-text organisation a Requester names for themselves. An input to the Reviewer's human judgement, never a credential and never validated.

### The data

**DDS** (Digital Disease Surveillance):
DDC's digital disease surveillance scheme — ระบบเฝ้าระวังโรคดิจิทัล. EnvOcc's part of it carries 25 disease report codes: `201`–`224` — 15 established under พ.ร.บ.ควบคุมโรคจากการประกอบอาชีพและโรคสิ่งแวดล้อม พ.ศ. 2562 and 9 added from ธ.ค. 2567 — plus `501` (Heat Stroke, โรคลมแดด). The set is amendable by announcement and is **not** contiguous. **DDS names the scheme**, and attributively its data — *DDS surveillance data*, the case-level records this service extracts from. Where the distinction matters, say **the upstream API** or **the upstream DDC system** for the authenticated platform the data is fetched *from*, so that a sentence like §18.4's "every documented path into the upstream system is RBAC" does not collapse into a circle.
_Avoid_: D506 (the former name here, retained only in `docs/research/` where it is quoted verbatim from cited sources — the `D506 Portal` URL among them)

**Disease group**:
The unit of disease a Request asks for — one named family of one or more Report codes, classified by DDC's own officers rather than received from upstream. A Requester picks exactly one and never sees a Report code. The classification is `docs/disease-groups.md` — ten groups, a partition of every Report code, each with a stable id that outlives its name — is published in the Data dictionary because it is our editorial act and not upstream's, and is amendable — so a Request stores the codes its group expanded to, not just the name.
_Avoid_: Disease, group_code, category, disease family

**Report code**:
One upstream `group_code` — `201`–`224` plus `501`, the deck's `รหัสรายงานโรค`, each mapping 1:1 to a primary ICD-10 code. Neither contiguous nor fixed in number. It is upstream's unit, not the Requester's: it names a query the extractor makes, and it reaches the Requester only as a column of the Extract. **Those 25 are this service's scope, not upstream's vocabulary**: the same endpoint answers to the general D506 notifiable-disease codes too (`02` acute diarrhoea, `301` tuberculosis, `601` hepatitis B, and more), and this service serves the EnvOcc block alone by decision. So *in-scope Report code* and *code upstream accepts* are different sets, and only the first is ever a Disease group's member.
_Avoid_: Disease code, group, ICD code

**Extract**:
The generated CSV — de-identified case-level rows, one flat file. Has its own lifetime, delivery, and expiry, distinct from the Request that produced it. It travels inside an Extract archive but is not the archive: every safety rule this service has — the allowlist, the granularity line, the 72-hour destruction — is about these rows, and the container is transport.
_Avoid_: Export, download, dataset, report

**Extract archive**:
The zip holding exactly one Extract and one Data dictionary — what a Download token delivers, and the only form in which an Extract leaves the service. Named `dds-envocc-sharing-{YYYYMMDD}-{HHMMSS}.zip` from the Request's submit moment in Asia/Bangkok, with a `-r2`, `-r3` suffix per Re-run, so two archives of one Request never share a name. Deliberately not fingerprinted: its bytes are not reproducible across runs, and the Data dictionary inside it is identical in every archive ever made.
_Avoid_: Zip, bundle, package, download

**Data dictionary**:
The fixed Thai/English gloss of the Extract's columns, shipped in every Extract archive under a fixed filename. It exists because the column names are English and the audience reads Thai, and it also publishes the Disease group classification, which is ours rather than upstream's and so must travel with the data. The same file in every Extract — a property of the service, never of the Request.
_Avoid_: Schema, codebook, legend, README

**Derived column**:
A column of the Extract computed by the service rather than received from upstream. There are exactly two — `onset_age` and `epidem_health_zone` — and each is named for the thing it was computed from, because the same name in the source means something else. A derived column may read only fields that are themselves in the allowlist, so adding one is an allowlist change, reviewed as one, and never a pipeline change.
_Avoid_: Calculated field, computed column, enrichment

**onset_age**:
The case's age in completed years at `onset_date` — a property of the case, not of the Request that pulled it. Anchoring it to the case is what lets two Extracts be compared or appended; an age measured from the submission date would report the same person differently in every Request. Empty when it cannot be computed honestly, never zero and never a sentinel.

**epidem_health_zone**:
The health region of `epidem_chw_code` — the address that answers *"cases I investigated"*. Deliberately not called `health_zone`: the source's column of that name follows `isolate_chw_code`, the treating unit's address, and the two disagree on roughly 7% of rows. The `epidem_` prefix says which address it came from.

**Span builder**:
The single function turning a Request into the half-open date range the service asks upstream for — `from` to `to` plus one day, because the human's `to` is inclusive and upstream's `end_date` is not. Both the Probe and the extraction job call it, which is the whole point: one expression of the range, so the two can never disagree about which days they covered. A second copy of that conversion is how 3,196 rows were once lost. It replaced a per-month chunk builder that had held the same guarantee as a side effect of tiling.
_Avoid_: Chunk builder, date splitter, window

**Probe**:
A single `page_size=20` upstream call made per Report code over a Request's whole span, purely to read exact `meta.total_items`. It fetches no data for the Extract, and it asks upstream the same question the extraction job later asks — same span, same one-call-per-code shape — differing only in `page_size`. It runs off the submit path, so a Request reaches the queue before its count does. **Nothing waits on it, human or machine**: a Reviewer may decide without it because size is not a ground for a Decision, and since the Span builder and the fixed disk floor, the extraction job no longer needs it either. The count survives for one reason worth the calls — catching the Request whose codes matched **nothing**, before the Requester waits — plus accountability for reject-path upstream traffic. A Probe whose calls exhaust their retries is **abandoned**, and only that catch is lost.
_Avoid_: Count query, pre-flight, dry run

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

**Extraction failure**:
A job that has exhausted its retries without producing an Extract. Two things at once, told to two different people: a technical fault the operator fixes, and a promise broken to a named person only a Reviewer will contact. Distinct from a Send failure and a Collection lapse, which concern an Extract that was successfully made.
_Avoid_: Job error, crash, failed request

**Alert**:
A must-clear item on the Reviewer queue, raised when something needs a human and cleared only by naming an outcome from a closed set. Never free text — the count of each outcome is the only measure the service has of how often its silent failures actually happen.
_Avoid_: Notification, warning, flag, task

**Re-run**:
A second extraction of an already-approved Request, started by a Reviewer pressing a button. Not a new Decision: the Requester, the parameters and the judgement are unchanged, so the record must read approved once, extracted twice. It makes a fresh Extract with a fresh Download token and a fresh clock, and never re-Probes.
_Avoid_: Retry, resubmit, reprocess

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
The copy of what a Reviewer had on screen, carried by their Decision — the Disease group's name over the Report codes it expanded to, the dates, the Area selection, the Probe row count, and the Workplace. Never the contact details. It makes a Decision legible on its own, years later.

**Extract fingerprint**:
The description of a released Extract that outlives the Extract itself — row count, column count, the size of the Extract, the size of its Extract archive, and a SHA-256 of the Extract's bytes as written. It answers what was released, where the record alone would only say that a release happened. The rows are never kept. It attests **content, not provenance**: two Requests asking the same question of the same data release identical bytes and so share a fingerprint, and every empty Extract shares one — so a match narrows to a set of Requests, never to one. The checksums of the reference data that produced the Extract are recorded beside it, never inside it: they describe what made the Extract, not what was released.
_Avoid_: Manifest, receipt

**Redaction**:
The manual removal of one Requester's contact details, performed on the host by a named operator. It is a courtesy to someone who asks, never an automatic expiry, and it is itself recorded as a Request event. It reaches the contact details and nothing else — never a Decision, never a Snapshot, never a Reviewer — and it is unavailable while the Request is still in flight. Nothing else in the record is ever removed.
_Avoid_: Erasure, purge, deletion

### The screen

Named because the two ordering rules — §16.4's and §10.2's — are requirements
about *these regions*, and a rule about an unnamed thing is a rule that gets
refactored away. Recorded by [ADR 0009](docs/adr/0009-the-visual-layer.md).

**Approval-gate notice**:
The first block on the Request form, stating that a named human reads the
Request before any data is fetched — *"นี่ไม่ใช่ปุ่มดาวน์โหลด"*. The only filled
dark ground in the service, because it is the one block that must not be skimmed
past. It states the no-reason rejection **up front**, rather than sprung at
rejection time.
_Avoid_: Banner, hero, disclaimer, warning

**De-identification block**:
The region above the Request form listing what the Extract will and will not
contain, including the Extract's columns by name. **Open, above the form, and
never collapsible** — a Requester who never opened it would receive a CSV with no
names in it and file it as broken. The requirement is that what you will and will
not get is visible before any field is filled in, without interaction, which is
why no `<details>` element appears on that page.
_Avoid_: Privacy notice, accordion, expander, "what you get" section

**Decision block**:
The region of the review screen holding approve, reject and the mandatory
internal note. It is the **last element in the document**, below the identity
fields and the ask, and it is deliberately neither sticky nor a fixed footer bar
— a sticky bar would put approve back on screen without the scroll, which is the
whole of what the rule buys. The weak form: it costs a scroll, not a click.
_Avoid_: Action bar, footer, toolbar, CTA

**Scheduler banner**:
The Thai banner across the top of the Reviewer queue, rendered from a heartbeat
stale for more than five minutes (§15.3). Amber rather than red: automatic
processing having stopped is not the service being down. It states what the stall
means for the Reviewer's own work — approved Requests are not being extracted,
and the 24-business-hour clock is still running — and never an error code.
_Avoid_: Error banner, alert, outage notice, toast

**Session warning**:
The bottom-left toast raised five minutes before the sliding idle timeout fires
(§10.5). **Not a modal** — a modal steals focus from a Reviewer mid-judgement and
can be dismissed by a stray Enter aimed at approve. **Not a banner** — a banner
at the top of a long review screen is off-screen exactly when it matters. It does
not auto-dismiss, because the thing it warns about does not go away, and it says
that an internal note in progress will not be kept.
_Avoid_: Modal, dialog, session popup, idle warning

**Theme**:
The named set of colour and sizing values the whole service is painted from,
defined rather than inherited from the component library, with every pair's
contrast ratio measured on each ground it is actually painted on. There are two,
and they differ by one surface colour: the Requester's and the Reviewer's. A
colour that is not in the theme is a colour nobody measured, so no colour is
written anywhere else.
_Avoid_: Palette, skin, style, brand colours

**Semantic component class**:
The name a piece of markup carries instead of a list of appearance utilities —
`btn btn-primary`, not forty tokens describing a button. It is the styling half
of §16.3's rule that a copy change must read as a copy change: a sentence buried
in a long class attribute cannot be reviewed as a sentence. Utilities are
permitted for layout only. Because the class is only a name in a stylesheet, it
is also what lets `/d/<token>`'s failure page look like the rest of the service
without the Angular bundle.
_Avoid_: Utility class, styled component, CSS-in-JS, design token
