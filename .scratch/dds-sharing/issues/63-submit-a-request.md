# Submit a Request

Status: closed
Source: https://github.com/rawinan-soma/dds-sharing/issues/63 (migrated 2026-09-21)

## What to build

An officer opens the public form, fills it in, submits, and lands on a confirmation page carrying a reference number. The Request is stored and a `submitted` event is on the record. Nothing is fetched from upstream and no Reviewer sees it yet — that is the next slice.

**The form is a single scrolling page**, not a wizard and not a two-column live preview. In order: the approval-gate notice, the de-identification block, the parameters, the contact fields, submit.

> **Requirement, not styling: the de-identification block is open, above the form, not collapsed.** A Requester who never opens it receives a CSV with no names in it and files it as broken. What you will and will not get is visible before any field is filled in, without interaction.

**Exactly three parameters.** Nothing else. Pagination, page size, date chunking, column choice, output format, current-address filtering, any row cap and any date floor are all deliberately off the surface — named here so nobody adds them later.

1. **Disease group** — exactly one, required, chosen from a picker showing the Thai family name. The Requester never sees or types a Report code.
2. **Date range** — one inclusive from/to, required, maximum span 365 days. **Rejected inline, never silently split.**
3. **Area selection** — optional. Empty means national. Otherwise exactly one province *or* one health region. Never both, never two.

**The 365-day cap is enforced in two places**: the picker greys out any `to` beyond `from + 365 days`, and the server re-checks on submit as a guard against direct API calls. The server's message names the cap as **upstream's**, because when a Requester asks why, "the DDC API caps it" is the true answer.

**Two expansions happen at submit, and the expansions are what is stored.** The Disease group expands to its Report code list; a health region expands to its province list. A stored Request names Report codes and provinces, never a group name alone and never a region — both taxonomies are amendable, and a Re-run must refetch what the first run fetched rather than what the names mean today. The human form is stored too: inclusive dates and the group's name, as the human made the ask.

**Area vocabulary is a trap worth surfacing.** The region is เขตสุขภาพ 1–13 from the `health_region` column of `docs/provinces.csv` — MoPH's health-region geography. Two other 13-way vocabularies exist and neither is this one, สคร. among them. *(Amended 2026-09-18: the copy no longer warns about the สคร. catchment; the page names เขตสุขภาพ and shows the provinces a region expands to, which is the check a reader needs. Spec §4.5.)* Picking a region shows the provinces it expands to.

**Five contact fields**: name, surname, telephone, email, workplace. All free text, none validated, none verified. `workplace` has no picklist and never will — it is an input to a human's judgement, never a credential.

**Duplicate suppression**: a submit from an IP that already has an unfinished Request is refused, worded as a friendly "you already have a request in progress". It catches the page refresh and the double-posted form, not an adversary. It is UX, not a rate limit — do not name it one.

**Never show the Requester a row count.** Hard rule, no exception. There is also no zero-row gate: a header-only CSV is a true answer.

**The confirmation page** carries the reference number, a restatement of the ask, the 24-business-hour service promise and the telephone number, and reads as *you are done* rather than *something went wrong*. It holds nothing in the address — a confirmation page addressable by reference number would be a second unauthenticated capability exposing a Requester's own ask. There is no receipt email, so a Requester who closes that tab loses the reference number until the Decision email arrives; that is accepted, not a bug.

The reference number is `REQ-2569-0142` in shape — Buddhist-era year — and is a display label. The UUID is the key and foreign keys use it. What the counter resets on is an implementer's choice.

Contact fields are stored in their own table, separate from the Request row, which carries no identifying data.

**All six load-bearing copy keys land in both catalogues**, each carrying a decision that exists nowhere else: `requester_gate_notice` (the approval gate, stated first, before anything else on the page), `requester_no_reason_notice` (the no-reason rejection, said up front rather than sprung at rejection time), `requester_span_cap_notice` (the cap, attributed to upstream), `requester_epidem_area_label` (the survey-address trap, made visible at the point of choosing), `requester_email_warning` (the only place a Requester is told a typo will not be caught), `requester_retention_notice` (what is kept, that it is kept indefinitely, why, and that redaction can be requested by phone — beside the email warning, above the form, not in a footer).

The visual layer is not settled here. Structure, ordering and copy are; spacing, typography and component choice are not. **The design now exists** — `docs/design/`, and the screens themselves in the Lunagraph project `dds-sharing` — so carry the ordering rules above as requirements and treat it as the source of visual layout.

## Acceptance criteria

- [ ] The form is one scrolling page in the order: gate notice, de-identification block, parameters, contact fields, submit
- [ ] The de-identification block renders open and above the form, with no interaction needed to read it
- [ ] The Disease group picker offers exactly the ten groups by name; no Report code is visible or typeable anywhere on the Requester surface
- [ ] A span over 365 days is refused inline by the picker **and** by the server, and the server's message attributes the cap to upstream
- [ ] An over-span Request is never split — it is refused
- [ ] Area selection permits national, or one province, or one health region, and never a combination
- [ ] Picking a region shows the provinces it expands to before submit
- [ ] The stored Request names Report codes and provinces; it stores no bare region and the group name only as the human form of the ask
- [ ] The five contact fields accept free text and none is validated or verified; `workplace` has no picklist
- [ ] A second submit from an IP with an unfinished Request is refused with the "request in progress" wording, not a rate-limit error
- [ ] No row count appears anywhere on the Requester surface
- [ ] The confirmation page carries reference number, restatement, the 24-business-hour promise and the telephone number, and its address carries no reference number
- [ ] A `submitted` event is written carrying IP and user agent
- [ ] Contact fields are stored separately from the Request row, which holds no identifying data
- [ ] All six load-bearing copy keys exist in both `th.json` and `en.json`, and CI's catalogue test stays green

## Blocked by

- #61 — Audit spine: append-only events the application cannot rewrite
- #62 — Reference data: provinces and the Disease group classification





## Comments

**rawinan-soma** — 2026-09-12

**The wireframe this ticket waits on now exists:** `docs/design_handoff_dds_sharing/`, landed in fd98274. Read its `README.md` first — the prototype runs, and `_ds/industry-*/styles.css` carries the tokens.

**Your screens: 1 (Request form), 2 (Review before submit), 3 (Acknowledgement), 4 (Duplicate suppression).**

Treat it as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and §16.4, and outrank the design wherever they disagree.

Two things to know before you start:

- **The de-identification block was missing from the design and has been added** — it is the one thing above that this ticket makes a hard requirement (*open, above the form, no interaction needed*). Same commit added `requester_email_warning` and `requester_retention_notice`, which had no home on screen either, and moved `requester_gate_notice` to lead the page. The README has a table mapping all six load-bearing copy keys to their screen positions.
- **The design is in English; production is Thai** (ADR 0010). Thai runs longer and the layout has not been tested against it. The README calls this its highest-value remaining gap.

Do not port `support.js` — it is the design tool's runtime. The dark `SIMULATE · SCAFFOLDING` dock is not part of the product. All data in it is fixture data.

**rawinan-soma** — 2026-09-17

Reopening: the implementation was discarded. The branch carrying this work (ticket#70) and its PR were deleted, so nothing on any branch satisfies this ticket. Back to ready-for-agent.

**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: **1** แบบขอข้อมูล (the form), **2** ส่งคำขอเรียบร้อยแล้ว (confirmation), **3** ท่านมีคำขอที่ยังดำเนินการอยู่ (duplicate suppression) and **10** สถานะบนแบบฟอร์ม (the over-365 refusal, province mode, incomplete submit).

The de-identification block, the two notices and the gate notice all have a home on screen 1, and the ordering rules in this ticket outrank the design wherever they disagree.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.

**rawinan-soma** — 2026-09-21

Merged in #104 (520db970a60e6b9fb2b59804cb25c10bb3a052a4).
