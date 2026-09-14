# Hi-fi interactive prototype prompt — Claude Design

Paste the text below into Claude Design. Grounded in `CONTEXT.md`, `docs/spec.md`
§2/§4/§10, and ADR-0003/0007/0010. Copy is English per ADR-0010 (translated to
Thai before production).

---

Build a hi-fi, interactive prototype of **DDS Sharing** — a web service where Thai
DDC officers request de-identified case-level extracts of epidemiological
surveillance data, and every request is approved by a named human before any data
is fetched. Make it a *working* prototype driven by in-memory fixture state, not a
set of static screens: every button changes state, and the state persists as I
navigate.

Copy is in English (it gets translated to Thai before production). Desktop-first,
1440px; the reviewer surface is desktop-only, the public form should also survive
at 390px.

## Two surfaces, one app

**A. Public request form** — unauthenticated, no accounts. The requester is an
officer at DDC or a regional office.

**B. Reviewer surface** at `/reviewer` — authenticated, named, accountable. Not
linked from the public app.

## Surface A — the request flow

Exactly three parameters. Do not add any others (no pagination, page size, column
choice, output format, or row cap — their absence is deliberate).

1. **Disease group** — pick exactly one from a picker of 10 named families.
   Requesters never see or type a report code. Use these families: Pesticides &
   agricultural chemicals · Heavy metals · Solvents & industrial chemicals ·
   Gases & asphyxiants · Occupational lung disease · Noise & physical hazards ·
   Musculoskeletal & ergonomic · Occupational skin disease · Heat-related illness
   · Other environmental exposures.
2. **Date range** — one inclusive from/to, required. Max span **365 days**.
   Over-span is **rejected inline, never silently split** — show the real error
   state with the actual span ("you asked for 402 days; the maximum is 365").
3. **Area** — optional. Empty = national. Otherwise exactly one province *or* one
   health region (เขตสุขภาพ 1–13) — never both, never two. Picking a region shows
   the provinces it expands to.

Then five contact fields: name, surname, telephone, email, workplace. Workplace is
free text and is never validated — it is an input to a human's judgement, not a
credential.

Screens to build:
- Form (empty → partially filled → validation-error → valid states)
- Review-before-submit confirmation showing exactly what was typed
- Submitted acknowledgement with a reference number, stating the wait is up to
  **24 business hours** and that no result appears on this page — it arrives by email
- Duplicate-suppression state: a submit from an IP that already has an unfinished
  request is refused, worded as a friendly "you already have a request in
  progress", not as a rate-limit error
- The delivery email itself, rendered as a preview
- The download page behind the emailed link, and its **expired** counterpart

**Never show the requester a row count.** That is a hard rule; do not add one.

## Surface B — the reviewer surface

A **split queue: list left, detail right.** No auto-refresh — a manual refresh
control that shows how stale the list is.

Review screen shows only:
- The five contact fields
- The request in human terms — disease group *name*, inclusive dates, area *name*.
  The report codes the group expanded to sit **beneath the name**, collapsed:
  available, never the headline.
- The **probe row count** as a single summed number, and crucially its three
  states: a number, **"pending"**, or **"failed"**. Approve must be fully usable
  in all three — nothing waits on the count.
- Submit time and time remaining on a business-hours clock — legible, not alarming
- How many requests are ahead of this one, and nothing more precise

**Load-bearing layout requirement: the Approve and Reject buttons sit BELOW the
identity fields and the ask.** Approve must not be reachable without scrolling
past what is being judged. Do not "improve" this by floating the buttons or
pinning an action bar.

Reject opens an internal note that the requester never sees. Approve is
irreversible and should feel like it — the reviewer's name goes permanently onto
the release.

Also build:
- **Alerts** on the queue as must-clear items, cleared only by picking an outcome
  from a fixed list — never free text. Three kinds: extraction failure, collection
  lapse (delivered but uncollected after 24 business hours), and send failure.
  An alert is assigned to one reviewer by name.
- **Re-run** — a button on an already-approved request. Not a new decision: the
  record reads *approved once, extracted twice*. Show the previous download token
  staying live until the new extract is ready, then being revoked.
- The **append-only event trail** on each request — occurrence, actor, timestamp.
  Four actor kinds: requester (network origin only), named reviewer, the system,
  or an anonymous token presenter. Nothing is ever edited or deleted.

## The lifecycle to make walkable

pending → (approve) → queued → running → ready → delivered → collected, with the
branches: rejected · expired at 24 business hours · extraction failed → alert ·
collection lapse alert → expired_uncollected. Give me a way to advance a request
through these states from the prototype (a small "simulate" control docked in a
corner, clearly marked as scaffolding) so I can walk the whole thing without
waiting.

Seed the queue with ~8 requests spread across those states, with plausible Thai
officer names, workplaces (สคร. regional offices, provincial health offices,
hospitals), and realistic date ranges and row counts (hundreds to ~40,000).

## Visual direction

Government service, not a SaaS dashboard: quiet, dense-but-legible, high contrast,
real data-table craft. Restrained palette with one accent; state colour used only
where state matters (pending/approved/rejected/failed). Tabular numerals for
counts and dates. It should look like a tool someone uses daily and trusts, not a
marketing page. No hero sections, no gradients, no illustration.

Make every interactive element genuinely interactive — filling, validating,
picking, approving, clearing an alert, re-running, downloading, expiring. I want
to click through the real workflow, not look at pictures of it.
