# Handoff: DDS Sharing — request, review and delivery

## Overview

DDS Sharing is a web application for requesting de-identified, case-level extracts of Thai DDC (กรมควบคุมโรค) environmental and occupational-health surveillance data.

A requester fills in a short public form — one disease group, one date range, one optional area, plus who they are. A named reviewer reads the request and approves or rejects it within 24 business hours. On approval the system fetches the data from the DDC API, writes a zip, and emails a collection link that lives for 72 hours. Nothing is ever shown on a page: the extract travels by email and is collected from a token URL.

The judgement a reviewer makes is **identity, not size** — does this person exist today, and do they work where they say? Row counts are shown, but the interface never treats a large request as a reason to refuse.

## About the design files

The files in this bundle are **design references created in HTML** — a prototype showing intended look, copy and behaviour. They are not production code to copy.

`DDS Sharing.dc.html` runs on a bespoke streaming-component runtime (`support.js`) that exists only in the design tool. **Do not port that runtime.** Recreate these screens in the target codebase's own environment using its established patterns and component library. If no environment exists yet, pick the framework that suits the project and build there.

What *is* worth lifting directly: the copy (it has been written carefully and carries policy), the state machine, the business-hours arithmetic, and the design tokens.

## Fidelity

**High fidelity.** Colours, typography, spacing, states, empty states, error states and copy are all final-intent. Recreate the UI faithfully using the codebase's existing libraries. Every value here traces to the Industry design system's `styles.css` (bundled) — prefer its CSS variables over the literal hex values.

Two deliberate exceptions, both marked in the prototype:

- **The dark "SIMULATE · SCAFFOLDING" panel is not part of the product.** It stands in for time passing and for the queue and mail server doing their work. Do not build it.
- **All data is fixture data held in memory.** There is no server, database, DDC API call, job queue or mail in the prototype. Sign-in accepts any six-digit code.

## Design tokens

From `_ds/industry-.../styles.css` (bundled). Reference the variables, not the hex.

**Colour**

| Token | Value | Used for |
| --- | --- | --- |
| `--color-bg` | `#f2f2f3` | Page ground |
| `--color-text` | `#1d1f20` | Body ink |
| `--color-accent` | `#5980a6` | Steel accent; primary button fill, blueprint marks |
| `--color-divider` | `#1d1f20` at 16% | Hairline rules |
| `--color-neutral-100…900` | `#f5f5f8` `#e7e7ea` `#d4d4d7` `#b7b7ba` `#98989b` `#7a7a7d` `#5d5d60` `#424244` `#2b2b2d` | Panels, secondary text, the dark dock |
| `--color-accent-100…900` | `#eef6ff` `#d6ebff` `#b5d9fd` `#94bce3` `#749dc4` `#597ea3` `#416180` `#2c455d` `#1d2d3d` | Tints, links (`700`), reviewer header field (`900`) |

Accent-to-ground is tuned to 3:1 — fine for chrome and large type, **not** for body copy. Paragraph text in the accent uses `--color-accent-700`.

**State colours** (ink / wash pairs, outside the ramp — these are semantic and were chosen for this app):

| State | Ink | Wash |
| --- | --- | --- |
| Pending | `#8a5a00` | `#fbf1dc` |
| Queued, Running | `#416180` | `#e7eff7` |
| Ready, Delivered, Collected | `#2f6b4f` | `#e4efe8` |
| Failed | `#8c2b21` | `#f7e7e4` |
| Rejected, Expired (both kinds) | `#6a6a6d` | `#eeeef0` |

Form validation errors use the failed pair with a 2px `#8c2b21` left border.

**Type** — `--font-heading` Barlow Condensed 600, `--font-body` Barlow. Body base 14px. Headings 31px (page), 26–28px (screen), 18–19px (section). Section kickers 13px uppercase, `0.09em` tracking, `--color-accent-700`. Meta and helper text 11–12.5px, `--color-neutral-600/700`. **Every date, time, reference number, telephone, row count and file name is `font-variant-numeric: tabular-nums`** — figures must not jitter between states.

**Spacing** — `--space-1…8` (3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2px). Radius `--radius-sm/md/lg` (2 / 4 / 7px), though this system is square-cornered in practice. Elevation `--shadow-sm/md/lg`.

**The blueprint frame.** Every card, figure and the primary button wears `.blueprint` plus four `<i class="corner tl|tr|bl|br">` registration marks. Cards are transparent line drawings — square corners, hairline border, no surface fill. The solid accent primary button is the one deliberate exception. Never drop the corner marks.

## Screens

Seven, across three surfaces. Sizes below are from the prototype at desktop width.

### Public surface

A light header bar (`--color-neutral-100`, hairline bottom rule) carries "DDS SHARING" in Barlow Condensed 19px over an 11px uppercase department line.

#### 1. Request form
`max-width: 920px`, centred, `padding: 36px 24px 120px`, `gap: 26px`.

**Order on the page is a requirement, not styling** (spec §16.4): approval-gate notice, de-identification block, the two notices, parameters, contact fields, submit.

An intro block leads with the **approval gate** in body ink — every request is read and approved by a named officer before any data is fetched — then the 24-business-hour promise and that the extract arrives by email and never on the page, then what is being asked for. A third paragraph — 2px accent left border — warns that an unapproved request is told only that it was not approved, and asks for a telephone number they answer.

**The de-identification block** is a blueprint section, kicker "BEFORE YOU START" over "What the extract contains", right-noted *the same 23 columns for every request*. **It is open, above the form, and needs no interaction to read** — a Requester who never reads it receives a CSV with no names in it and files it as broken. It opens by saying so outright ("a file with no names in it is the correct result, not a broken one"), then two columns, *You will get* / *You will not get*, each an accent kicker over a list:

- **Will get** — one row per case; the report code, ICD-10 diagnosis and diagnosis list; birth date, age at onset, gender, prefix, nationality, occupation, marital status; province and district of registration, province and district at survey, and the health region of the survey province; the hospital code; onset, treatment, diagnosis, death, report and update dates.
- **Will not get** — names, surnames, national ID; addresses, house numbers, roads, villages; sub-district (ตำบล) or finer, the district being the finest named geography; map coordinates; free text of any kind; any contact detail of a case.

It closes on the allowlist being strict and not negotiable per request — *a reviewer cannot widen it for you* — and on the data dictionary travelling in every archive. The lists are `docs/spec.md` §6.2's 23 columns and §6.1's six rules; that spec is the source, not this file.

**Two notices sit between the block and the form**, a two-up grid of accent kickers over 12.5px neutral text — deliberately not a footer:

- *The email address you give* — the link goes there and nowhere else, is never checked, and a typo tells nobody.
- *What is kept, and for how long* — contact details and the record of the request kept **indefinitely**, **why** (every release stays traceable to who asked and who approved), and that contact details can be **removed on request by telephone** once the request is finished.

Four numbered blueprint sections, each `padding: 20px 22px`, heading row of `01`–`04` in accent + an 19px title + a right-aligned 12px requirement note:

**01 Disease group** — exactly one, required. Ten radios in `repeat(auto-fit, minmax(260px, 1fr))`. The ten groups, in order, with the report codes each expands to at submit:

| Group | Thai (production string) | Codes |
| --- | --- | --- |
| Air pollution exposure | โรคจากการสัมผัสมลพิษทางอากาศ | 201 |
| Silicosis | โรคซิลิโคสิส | 202, 203 |
| Asbestos-related disease | โรคจากแร่ใยหิน | 204–207 |
| Lead and lead compounds | โรคจากตะกั่วและสารประกอบของตะกั่ว | 208 |
| Pesticide poisoning | โรคจากสารกำจัดศัตรูพืช | 209–218 |
| Confined-space injury | การบาดเจ็บจากภาวะอับอากาศ | 219 |
| Radiation exposure | โรคจากรังสี | 222–224 |
| Work-related disease | โรคจากการทำงาน | 220 |
| Environmental pollution exposure | โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม | 221 |
| Heat-related illness | โรคจากความร้อน | 501 |

Authored in English per ADR-0010; **production shows the Thai name.** The classification is authoritative — `docs/disease-groups.md` is the source, not this file.

**02 Date range** — two native date inputs (190px each) plus a live "N days, inclusive of both" readout. Inclusive both ends, required, **maximum 365 days** (the DDC API's cap). A wider range is refused, never silently split; the helper text says to send more than one request.

**03 Area** — optional. A segmented control: Whole country / One province / One health region. Province reveals a select of all 77 provinces + Bangkok (`name_th · code`, from `docs/provinces.csv`). Region reveals a เขตสุขภาพ 1–13 select **plus the provinces it expands to, as accent tags** — a region is stored as its province list, not as the region, so a stored request keeps meaning what it means today even if a boundary moves. Two notes: เขตสุขภาพ is the MoPH health region and is *not* the สคร. catchment; and the filter is on the province that **investigated** the case, not residence.

**04 Who is asking** — name, surname, telephone, email in `repeat(auto-fit, minmax(220px, 1fr))`; workplace full width. All five required, **none validated** beyond non-empty. The workplace note says it is free text, never checked against a list, and is what a reviewer weighs.

Footer: primary "Check the request" + "Nothing is submitted yet."

**Where the six load-bearing copy keys land** (spec §16.3 — each carries a decision that exists nowhere else):

| Key | On screen |
| --- | --- |
| `requester_gate_notice` | first paragraph of the intro block, before anything else on the page |
| `requester_no_reason_notice` | the accent-bordered paragraph under the intro |
| `requester_span_cap_notice` | the note closing section 02 |
| `requester_epidem_area_label` | the survey-address note in section 03 |
| `requester_email_warning` | left notice above the form |
| `requester_retention_notice` | right notice above the form |

#### 2. Review before submit
`max-width: 780px`. "Is this what you meant?" over a warning that a submitted request cannot be edited by anyone, including a reviewer. A `.table` of seven rows — group (with the Thai string as a sub-note), dates (with day count), area (with the expanded province list), name, telephone ("a reviewer may call this number before deciding"), email ("the extract link goes here, and nowhere else"), workplace. Actions: "Submit the request" / "Go back and change it".

#### 3. Acknowledgement
`max-width: 720px`. "Received" tag, then "Your request is with a reviewer". States 24 business hours (Mon–Fri, 08:30–16:30) and that nothing appears on this page. A blueprint panel shows **reference number** (`REQ-2569-NNNN`, Buddhist-era year) and **decision due by**, both 26px Barlow Condensed tabular. Closing line names the email address and the 72-hour link life.

#### 4. Duplicate suppression
Shown instead of the acknowledgement when the same origin already has a request in flight (pending, queued, running, ready, delivered or failed). "You already have a request in progress" — states how long ago and its current state, that **this one was not sent**, that nothing is lost and nothing needs doing. Shows the earlier reference and its timestamp.

### Delivery

#### 5a. Delivery email (approved)
`max-width: 820px`, rendered as an email card on `--color-neutral-100`: From / To / Sent / Subject header grid over the body. Thai salutation (เรียน), the reference, a bordered spec grid (group, dates, area, file name), a primary "Collect the extract" button, then the 72-hour expiry — *"Opening it does not extend it"* — and a note that the archive holds one CSV plus the Thai/English data dictionary, and must not be forwarded because the link is the only credential.

File naming: `dds-envocc-sharing-YYYYMMDD-HHMMSS.zip`, suffixed `-rN` for re-runs.

#### 5b. Rejection email
Same shell, different content. **Says it was not approved and says nothing else** — no reason, no reviewer's name. It does carry a telephone number and the reference, so someone wrongly refused has a route back. The reasoning is documented on-screen beneath it: a reason invites argument and teaches people how to phrase the next attempt.

#### 6. Collection page
`max-width: 760px`, with a faux URL bar noting the page is **served by the API, not the app** — an extract stays collectable even if the front end fails to load. Three mutually exclusive states:

- **Live** — "Ready to collect" tag, file name, size, time remaining, attempts used (of 10), primary "Download the archive", and "Every attempt is counted and audited, whether or not the transfer finishes."
- **Expired** — 72 hours from creation, never extended by use; the file has been destroyed. Tells them to request again, and to telephone quoting the reference if the link expired unfairly.
- **Replaced** — a re-run produced a newer extract, retiring this link. Points at the most recent email.

### Reviewer surface — route `/reviewer`, not `/admin`

#### 7a. Sign in
Centred blueprint card, 420px. **Username, password and a Google Authenticator code on one form, submitted and checked together.** Never two steps — a two-step form reveals when the password was right. One generic failure for all three causes: "Username, password or code is wrong." Failed attempts are counted and described as recorded with IP and user agent, **never with what was typed**. Notes state accounts are seeded on the host, there is no self-service reset, the other reviewer is the recovery path, and two named reviewers must be reachable at all times. A closing note says the route is unlinked and kept out of search results — tidiness, not security.

#### 7b. Queue and dossier
Full-height split: `grid-template-columns: minmax(300px, 378px) minmax(0, 1fr)`. Header is a `--color-accent-900` field with paper type reversed out, carrying the brand, the clock, the signed-in name, and sign out.

**Sidebar** (`--color-neutral-100`, hairline right rule) — a header plus **three zones**, each shrinkable with its own scroll. The zones are spec §10.1's, and they are not visual grouping: **a request is in exactly one zone at a time, whichever carries the action it needs.** Where a request sits is what tells a reviewer what they can do with it.

0. *Header* — "Queue", the pending count, a single manual **Refresh** button and a "refreshed N min ago · N changes since" line. **One refresh covers all three zones**, and the staleness line counts changes across all of them — one press is one round trip, which matters because every press extends the session. Nothing polls, because a polling screen would keep the session alive for ever; **mail is the notification channel.** A second line counts finished requests that have dropped off and says their records are kept.
1. *Queue* — **pending requests only**, the decisions not yet made. min-height 110px, scrolls. Rows: reference + right-aligned state tag; requester name; workplace; group and relative age; an amber "N h NN m left" against the 24-business-hour clock. Selected row is washed in 12% accent. **Oldest first** — the clock is what matters here.
2. *Alerts* (only when open) — amber field `#fbf1dc`, min-height 64px, each alert a card with kind, reference, requester, assignee and age. **The only part of this surface allowed to shout.**
3. *In flight* — approved and not yet terminal. min-height 96px, scrolls, with a sticky `IN FLIGHT` kicker and a count. Rows carry the queue's fields minus the decision clock, plus the two that say what can be done: **`queued`/`running` renders *"extracting — nothing to do until it finishes"*** (without it a reviewer assumes the screen is broken), and a **`ready` row shows wall-clock time left on the download link**. **Submit order, oldest first** — the same direction as the queue above it, and explicitly *not* ordered by whether a row is actionable.

> **The approving reviewer's name is deliberately not on the in-flight row.** It is accountability, not a scanning aid, and it is on the dossier's decision line where the reviewer is about to act. The list is everyone's requests and any active reviewer may act on any of them.

**An open alert suppresses its request's in-flight row entirely** — no badge, no duplicate. A badge on a list that does not auto-refresh is the passive list the alert zone exists to avoid. Clearing the alert returns the request to the in-flight list if it is still in flight, or drops it from the surface if the clearing was the last thing to do. Because a row can be missing for this reason, the in-flight zone says so in a line above it rather than letting a request appear to vanish.

**Finished requests leave the surface.** Terminal is collected, expired uncollected, or a failure a reviewer cleared as *abandoned*; rejected and expired-undecided leave at the decision and were never in flight at all. A finished request stays readable while it is the current selection, so watching one run to collected does not yank the dossier away.

**Dossier** — scrolls independently. Reference + state tag + "N requests ahead of it", with a toast slot top-right.

A two-column blueprint ledger: **Who is asking** (name and workplace at 19px/15px Barlow Condensed, then tel / email / origin IP) beside **What they asked for** (group at 19px, a ghost-button code-count that expands to the frozen report codes, dates with day count, area). Below, a three-cell strip: **probe row count** (30px tabular), **time remaining**, **submitted**. Then the judgement line: *identity, and identity only; where the screen cannot answer it, telephone before deciding either way.*

Probe counts are real measured volumes — single digits to ~1,900 rows a year per code; the whole domain is ~3,861 rows a year. The probe has three states (a number, pending, failed) and **nothing waits on it**: approve works identically in all three. A failed probe reads "the count is lost, the decision is not."

Actions, on a hairline top rule:

- **Pending** — primary "Approve and release" + secondary "Reject", with "Approving is irreversible. A request that is too broad is a reject the requester can narrow and resend, never an edit."
  - *Approve* opens an accent-tinted confirm: "Your name, {reviewer}, goes onto this release permanently."
  - *Reject* opens an internal-note field. Required, min 10 characters, kept on the record, **never shown or sent to the requester**, and explicitly not saved as you type ("a shared desk is the wrong place for this to linger").
- **Decided** — the decision line ("Approved by … · timestamp"), the internal note for rejections, and where applicable **Send the delivery again** (same link, same address, no new extract, no extension of the 72 hours — and the reviewer never sees the link) and **Re-run the extraction** (not a new decision; the old link stays live until the new extract is ready, then is revoked).

> ⚠️ **There is no third action, and there must not be one. A reviewer cannot correct a requester's email address.** The resend control takes no address field: a delivery goes to the address on the request or it does not go. A requester who mistypes their own address has ended their request and submits again, exactly as one who missed their 72 hours does. **A reviewer decides who gets data, never where it goes.** Recorded as ADR 0017 — this is the absence most likely to be "fixed" by someone who has not read it.

**Alerts on the request** — each names its kind, when it was raised, and who it is assigned to *by name*. Cleared by picking one outcome from a closed set (never free text — the counts are the only measure of how often this happens):

| Alert | Raised when | Outcomes |
| --- | --- | --- |
| Extraction failed | The job exhausted its retries | Contacted the requester · Abandoned |
| Collection lapse | 24 wall-clock hours delivered, zero attempts (held until business hours to raise) | Reached · Could not reach · No action needed |
| Send abandoned | The relay refused all 5 send attempts | Reached · Could not reach · No action needed |

A re-run **defers** an alert rather than clearing it; only an extract that actually arrives clears it, and that clearance is attributed to the system — "nobody takes credit for a call they did not make."

**Extracts table** — per run: run number, archive name, rows, link state (live / revoked / expired / none), attempts of 10, collection time.

**Event trail** — append-only, newest first. Each row: timestamp, event name, actor, and actor *kind* (requester · network origin only / named reviewer / the system / anonymous token presenter), plus detail. Closing note: nothing is ever edited or deleted; a correction is another event citing the one it corrects.

**Empty states** — the list and the dossier each have their own. Empty-queue copy branches on open alerts: with alerts outstanding it says the desk is not clear and points at them, instead of saying there is nothing to do and that signing out is safe.

## Interactions and behaviour

**Business-hours arithmetic.** Mon–Fri 08:30–16:30 ICT (UTC+7). Two functions carry it: `businessHoursBetween(from, to)` and `addBusinessHours(from, hours)`. Used for the 24-hour decision deadline, the "N h NN m left" countdown, and for holding alerts until business hours to raise. Worth porting more or less as written.

**The 24-hour expiry is enforced at the moment of decision, not only by a sweeper.** If a reviewer presses Approve on a request that has aged out while they were reading it, the decision is **refused**, the request becomes expired, and the attempt is written to the trail.

**Lifecycle.** `pending → queued → running → ready → delivered → collected`, with `pending → rejected`, `pending → expired` (undecided past 24 business hours), `queued|running → failed`, and `delivered → expired_uncollected` (72 hours, no attempt).

**Re-run.** Appends a run; does not re-probe and does not re-decide. The previous token stays live until the new run reaches `ready`, at which point it is revoked and the revocation is written to the trail — one request never has two live links.

**Immutability.** A submitted request cannot be edited by anyone. An approval snapshots the parameters (group → frozen report codes, span, area → frozen province list) so a re-run refetches what was approved, whatever the group means later.

**Validation.** All on submit, never as you type. Missing group; missing or inverted dates; span over 365 days (message names the actual day count); and a single contact message naming exactly which of the five fields are still empty. Errors render as `#8c2b21` text on `#f7e7e4` with a 2px left border.

**Responsive.** The public surface is fluid. The reviewer split is desktop-only by design. The prototype's shell is a `100vh` flex box: content column plus scaffolding dock, switching to a stacked column with a bottom sheet below 1180px. **Only the content column is product** — the reviewer split needs a definite-height ancestor and independent scroll on the sidebar and dossier; every block inside the sidebar needs `min-height: 0` or it refuses to shrink and starves the list.

## State

Per request: `id`, `ref`, `state`, group id + frozen `codes`, `from`/`to`, area kind + label + frozen province list, the five contact fields, `submittedAt`, origin IP, `probe {status, rows}`, `decision {reviewer, at, rejected, note}`, `runs[]`, `events[]`.

Per run: `n`, `readyAt`, `deliveredAt`, `collectedAt`, `token` (`none` | `live` | `revoked` | `expired`), `attempts`, `sends`, `rows`.

Per alert: `id`, `kind`, `reqId`, `assigned`, `raisedAt`, `status` (`open` | `rerunning` | `cleared`), `outcome`, `clearedBy`, `clearedAt`.

Session: the signed-in reviewer, the selected request, and the list's own refresh timestamp and change count (the list is deliberately stale until refreshed).

Real fetching, absent here: submit a request; probe row counts off the submit path; poll or subscribe to the queue *server-side*; record a decision; enqueue and run the extraction job; send mail; serve the token download from the API.

## Assets

No images and no icon set. Everything is type, rules and the blueprint corner marks. Barlow and Barlow Condensed come from the design system. If your codebase already has a brand system, use it rather than these tokens.

## Files

- `DDS Sharing.dc.html` — the whole prototype: all seven screens, the lifecycle engine, the business-hours clock, and nine seeded requests covering every state.
- `support.js` — the design tool's runtime. **Reference only; do not port.**
- `_ds/industry-.../styles.css` — the design tokens and component classes. Worth reading.
- `_ds/industry-.../readme.md` — the Industry design system guide.
- `_ds/industry-.../_ds_bundle.js` — the component bundle the prototype loads.

Authoritative sources in the `dds-sharing` repo, which outrank this document wherever they disagree: `docs/spec.md`, `CONTEXT.md`, `docs/disease-groups.md`, `docs/provinces.csv`, and the ADRs.

## Known gaps

1. **The UI is in English.** Requester-facing copy must be Thai; Thai runs longer and the layout has not been tested against it. Highest-value remaining work.
2. **The extract's columns and the data dictionary are described but never shown.** If either audience needs to know what they are getting, that is a screen nobody has designed.
3. **Accessibility is unworked** — focus order, labels and keyboard paths through the queue. Government services are usually audited on this.
4. **Narrow widths are untested on real devices.**
5. **Some copy is the designer's rather than the spec's** — the emails especially. Have the wording owner read them.
