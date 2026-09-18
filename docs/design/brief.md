# Design brief — DDS Sharing

**What this is.** The inventory of every screen this service needs, what each one
must contain, and which rules about it are *requirements* rather than styling.
It is written for a designer starting from nothing, and it is the document the
implementation tickets will cite once the design exists.

**What it is not.** It settles no visual decision — no palette, no type, no
component library, no spacing scale. Those are §8, open, and yours.

**Authority.** `CONTEXT.md` fixes the vocabulary; `docs/spec.md` §16 the routes
and the page order; §10.1–10.2 the Reviewer surface; the ticket bodies
(#63, #64, #65, #71, #73, #74) the per-screen content. **Where this brief and
those disagree, they are right and this is a bug.** Use their words, not
paraphrases — *Requester*, *Reviewer*, *Request*, *Extract*, *Download token*,
*Alert*, *Re-run*. `docs/disease-groups.md` and `docs/provinces.csv` are the
reference data, and they are canonical.

---

## 1. Two surfaces, three servers

| Surface | Route | Served by | Audience |
|---|---|---|---|
| Public | `/`, `/submitted`, `/link-expired` | Angular SPA | Requesters — DDC and สคร. officers, not authenticated, never verified |
| Reviewer | `/reviewer/...` | Angular SPA | Two or more named, authenticated Reviewers |
| Collection | `/d/<token>` | **NestJS, not the SPA** | Whoever holds the link |

`/d/<token>` is outside the Angular bundle on purpose (ADR 0003): an Extract
must stay collectable inside its 72 hours even if a front-end asset fails to
load. It is also **fixed** — it travels in email and outlives any redeployment.
The Reviewer surface is `/reviewer`, never `/admin`, and is unlinked and
`noindex`. No security is claimed for the path.

## 2. Screen inventory

| # | Screen | Route | Ticket |
|---|---|---|---|
| 1 | Request form | `/` | #63 |
| 2 | Confirmation | `/submitted` | #63 |
| 3 | Duplicate-suppression refusal | `/` (state) | #63 |
| 4 | Sign in | `/reviewer` | #64 |
| 5 | Queue + review dossier | `/reviewer/...` | #65, #66 |
| 6 | Alerts on the queue | `/reviewer/...` | #73 |
| 7 | In-flight list, Re-run and resend | `/reviewer/...` | #74 |
| 8 | Collection | `/d/<token>` | #71 |
| 9 | Expiry page | `/link-expired` | #71 |
| 10–13 | Four emails — Delivery, Reviewer queue notification, rejection, extraction failure | — | #71 |

Screens 5, 6 and 7 are **one screen in three slices**, not three screens. Design
it whole; the tickets land it in order.

## 3. What each screen holds

### 1. Request form

One scrolling page. Not a wizard, not a two-column live preview.

**Order is a requirement (§16.4):** approval-gate notice → de-identification
block → the three parameters → contact fields → submit.

- **Gate notice, first.** Every Request is read and approved by a named officer
  before any data is fetched; a Decision takes up to 24 business hours; the
  Extract arrives by email and never appears on a page; an unapproved Request is
  told only that it was not approved.
- **De-identification block — open, above the form, no interaction needed.**
  What you will get (the Extract's 23 columns, §6.2) and what you will not
  (names, national ID, addresses finer than district, coordinates, free text,
  any contact detail of a case — §6.1). The allowlist is strict and a Reviewer
  cannot widen it per Request. *A file with no names in it is the correct
  result, not a broken one.*
- **Exactly three parameters. Nothing else.** Pagination, page size, chunking,
  column choice, output format, row caps and date floors are deliberately off
  the surface — named here so nobody adds them later.
  1. **Disease group** — one, required, picked never typed. The ten groups of
     `docs/disease-groups.md`, in that order, by Thai name. **No Report code is
     visible or typeable anywhere on this surface.**
  2. **Date range** — one inclusive from/to, required, **max 365 days**. Refused
     inline and again server-side, never silently split. The cap is upstream's
     and the copy says so.
  3. **Area** — optional. Whole country (default) *or* one province *or* one
     health region. Never both, never two. 77 provinces and เขตสุขภาพ 1–13 from
     `docs/provinces.csv`. Picking a region shows the provinces it expands to.
     Two traps to surface at the point of choosing: เขตสุขภาพ is MoPH's health
     region and is **not** the สคร. catchment; and the filter is on the province
     that **investigated** the case, not residence.
- **Five contact fields** — name, surname, telephone, email, workplace. All
  required, none validated, none verified. Workplace has no picklist and never
  will: it is an input to a human's judgement, never a credential.
- **Two notices that are not a footer** — the email address is where the link
  goes and a typo tells nobody; contact details and the record are kept
  **indefinitely**, why, and that removal can be requested by telephone once the
  Request is finished.

**Never show the Requester a row count.** Hard rule, no exception.

### 2. Confirmation

Reference number (`REQ-2569-0142` shape, Buddhist era, a display label), a
restatement of the ask, the 24-business-hour promise, the telephone number.
**Reads as *you are done*, not as *something went wrong*.** Nothing in the
address — a confirmation page addressable by reference number would be a second
unauthenticated capability exposing a Requester's own ask. There is no receipt
email, so closing the tab loses the reference number until the Decision email
arrives. That is accepted.

### 3. Duplicate suppression

A submit from an IP that already has an unfinished Request is refused, worded as
a friendly *you already have a request in progress*. It catches the page refresh
and the double-posted form, not an adversary. **It is UX, not a rate limit — do
not name it one on screen or in the file names.**

### 4. Sign in

Username, password and a six-digit TOTP code on **one form**, submitted and
checked together — a two-step form reveals when the password was right. **One
generic failure for all three causes.** Failed attempts are recorded with IP and
user agent, never with what was typed. Accounts are seeded on the host; there is
no self-service reset; the other Reviewer is the recovery path. A T-5-minute
session warning is a toast, bottom-left — not a modal, not a banner.

### 5. Queue + review dossier

**Split: list left, detail right.** A no-list hand-off and an approve-gated
variant were both built and rejected.

**The list carries three zones, and a Request is in exactly one at a time** —
whichever carries the action it needs:

1. **Queue** — pending Requests only, the Decisions not yet made. Oldest first.
2. **Alerts** — only when open. The only part of this surface allowed to shout.
3. **In flight** — approved and not yet terminal. Submit order, oldest first,
   explicitly *not* ordered by whether a row is actionable.

**No auto-refresh.** Only user-initiated requests extend the session, so a
polling screen would make an idle timeout that never fires. One manual refresh
covers all three zones and shows how stale the list is. Mail is the
notification channel.

**The dossier shows, and only shows:**
- the five contact fields;
- the parameters in human terms — group *name*, inclusive dates, area *name*.
  **Report codes sit beneath the name, collapsed**: available, never the
  headline;
- the Probe row count as **a single summed number**, or *pending*, or *failed*.
  Nothing waits on it; approve works identically in all three;
- submit time and time remaining on the business-hours clock — felt, not alarming;
- how many Requests are ahead of this one, and nothing more precise.

**No projected drain estimate. Do not add one.**

> **Requirement, not styling: the decision buttons sit BELOW the identity
> fields and the ask.** Approve must not be reachable without passing what is
> being judged. This is the deliberately **weak** form — it costs a scroll, not
> a click. Do not float the buttons or pin an action bar.

Approve is irreversible and its confirm says the Reviewer's name goes onto the
release permanently. Reject opens an internal note — required, kept on the
record, **never shown or sent to the Requester**, and not saved as you type.

### 6. Alerts

Three kinds — **extraction failure**, **collection lapse**, **send abandoned**.
Each names its kind, when it was raised, and who it is assigned to **by name**.
Cleared only by picking one outcome from a closed set, **never free text**: the
count of each outcome is the only measure this service has of how often its
silent failures happen. An open Alert **suppresses its Request's in-flight row**
— a Request appears exactly once on the surface — and the in-flight zone says so
above itself rather than letting a row appear to vanish.

### 7. In-flight list, Re-run and resend

Rows carry the approving Reviewer's name (accountability, not permission — any
active Reviewer may act on any row) and the wall-clock time left on the Download
token. Actions are gated by what is physically possible:

| Extraction state | Row reads | Available |
|---|---|---|
| queued, running | *extracting — nothing to do until it finishes* | nothing |
| ready | time left on the link | Re-run, resend to the same address |
| failed | *extraction failed* | Re-run, and the Alert's outcomes |

Render the queued/running line: without it a Reviewer assumes the screen is
broken.

> ⚠️ **There is no third action and there must not be one. A Reviewer cannot
> correct a Requester's email address.** The resend control takes no address
> field. A Reviewer decides who gets data, never where it goes.

### 8. Collection

Served by NestJS. The link is the only credential. States: the archive streams;
or the link is dead. Tell the holder the archive contains one CSV and the
Thai/English Data dictionary, that the link expires 72 hours after the Extract
was made and **opening it does not extend it**, and that it must not be
forwarded.

### 9. Expiry page

**One page, one sentence, plus the contact telephone number. Always identical.**
Four states render it — expired token, exhausted attempts, deleted object, and a
token that never existed — and they are distinguished in the audit record and
nowhere else. **No reference number on this page**: a token that never existed
has none, and showing it where we have it tells someone walking the token space
which guesses landed.

### 10–13. The four emails

Delivery, Reviewer queue notification, rejection, extraction failure. All four
take their wording from the copy catalogue, not from templates. **The rejection
email gives no reason** — that silence is a decision, and outside the catalogue
it changes as a template edit nobody reviews as one. The Delivery email carries
the Download token and never the file.

## 4. The rules that are requirements, not styling

1. Form order: gate notice → de-identification → parameters → contact → submit.
2. The de-identification block is open and above the form.
3. Decision buttons sit below the identity fields and the ask.
4. No Report code anywhere on the Requester surface.
5. Never show the Requester a row count.
6. The queue holds pending Requests only, and nothing auto-refreshes.
7. A Request appears exactly once on the Reviewer surface.
8. No resend-to-a-different-address control.
9. No reference number on the expiry page.
10. `/reviewer`, never `/admin`.

## 5. Copy

**Authored in English, served only in Thai** (ADR 0010). Design in English,
**but the layout must survive Thai**, which runs materially longer and sets its
own line height. Test with real strings in the longest fields — the ten group
names, the notices, the alert outcomes — not with lorem.

Six keys are load-bearing, each carrying a decision that exists nowhere else.
Every design must give each one a home:

| Key | What it says |
|---|---|
| `requester_gate_notice` | the approval gate, stated first, before anything else |
| `requester_no_reason_notice` | a rejection gives no reason — said up front, not sprung at rejection time |
| `requester_span_cap_notice` | the 365-day cap, attributed to upstream |
| `requester_epidem_area_label` | the survey-address trap, at the point of choosing |
| `requester_email_warning` | the only place a Requester is told a typo will not be caught |
| `requester_retention_notice` | what is kept, indefinitely, why, and that removal is by telephone |

## 6. Audience and conditions

DDC and สคร. officers on ordinary internet connections, reading Thai, analysing
in Excel, R or Python. Desktop is the working assumption; narrow widths must not
break. A Requester uses this **once**, with no training and no support channel
beyond a telephone number — so every rule the service enforces has to be legible
on the page before it is hit.

## 7. Open decisions — settle before designing screen 2

Each is the repo owner's call. Two are settled and struck through below.

1. ~~**Visual direction.**~~ **Settled 2026-09-17 (repo owner): the surveillance
   map.** The system is built on the one visual the domain already owns —
   province and health region. Area selection is a schematic map of the 13
   เขตสุขภาพ rather than a select, and its palette (land, ground, one selection
   colour) sets the tokens for everything else. Two constraints on it: the map
   is the control inside **parameter 3**, so the gate notice and the
   de-identification block still come first (§16.4); and it is **schematic, not
   cartographic** — 13 region shapes, no 77-province polygon file, because a geo
   dependency would have to be carried into the Angular build for one control.
   A province is chosen from a list, and the map highlights the region it sits in.
2. ~~**Type.**~~ **Settled 2026-09-17 (repo owner): IBM Plex Sans Thai with IBM
   Plex Sans.** One superfamily drawn together, so mixed Thai/Latin lines
   (`เขต 8`, `REQ-2569-0142`) keep an even colour, and the tabular figures carry
   the dates, counts, reference numbers and hours-left this UI is full of.
3. ~~**Component library.**~~ **Settled 2026-09-17 (repo owner): design against
   the Lunagraph project's own design system, and port its tokens and component
   shapes into the Angular build.** ⚠️ **The Lunagraph project was empty** — no
   theme, no components — so there is nothing to inherit and the system is one
   we define: tokens in the project's CSS entry, components as project files.
   Anything drawn must be renderable in Angular without pulling in the design
   tool's runtime.
4. ~~**Is there a "check your request before submitting" step?**~~ **Settled
   2026-09-18 (repo owner): yes, a check page.** ADR 0017 made a mistyped email
   unrecoverable after submit, which turned this from a neutral choice into the
   only place a typo can be caught. Screen 1b. A typo discovered *after* submit
   cannot be fixed, and the Request runs its course (spec §16.4).
5. ~~**Accessibility target.**~~ **Settled 2026-09-17 (repo owner): design to
   WCAG 2.1 AA, claim nothing.** §18.12 stands unamended and no ADR is written —
   there is no conformance claim and no audit obligation. AA is a working
   standard for the design: 4.5:1 on body text, visible focus, labelled
   controls, and a keyboard path through the split queue. **Do not write a
   conformance claim into any document.**
6. ~~**Does the Extract's column list need a screen of its own?**~~ **Settled
   2026-09-18 (repo owner): no.** The de-identification block describes the
   columns in plain terms and the Data dictionary arrives inside the archive. The
   accepted cost: a Requester who needed a detail the Extract does not carry
   finds out after approval, not before.

## 8. Repo gaps a designer will hit

- **ADRs 0015, 0016 and 0017 are cited by #74 but are not in `docs/adr/`.**
  0017 — *a Reviewer never corrects a Requester's email address* — is
  load-bearing for screen 7 and is captured in this brief instead.
- **`docs/spec.md` §16.4 links to a `prototype/requester-reviewer-ui` branch
  that no longer exists**, and calls it the source of visual layout.

---

## 9. What has been designed (Lunagraph project `dds-sharing`, 2026-09-17)

The token system lives in the project's `app/globals.css` and is the source of
the design's colour, type and geometry. It has to be copied into the repo when
the Angular build starts; it is not in this repository yet.

| Screen on canvas | Covers | Ticket |
|---|---|---|
| 1. แบบขอข้อมูล | Request form, all three parameters, the region map | #63 |
| 2. ส่งคำขอเรียบร้อยแล้ว | Confirmation | #63 |
| 3. ท่านมีคำขอที่ยังดำเนินการอยู่ | Duplicate suppression | #63 |
| 4. เข้าสู่ระบบ | Reviewer sign in | #64 |
| 5. คิวและแฟ้มคำขอ | Split queue, three zones, dossier, decision actions | #65, #66 |
| 6. แจ้งเตือนและการส่งซ้ำ | Alert clearing, resend, re-run | #73, #74 |
| 7. หน้าเก็บไฟล์ | Collection at `/d/<token>` | #71 |
| 8. ลิงก์ใช้ไม่ได้ | The expiry page | #71 |
| 9. อีเมลทั้งสี่ฉบับ | Delivery, queue notification, rejection, extraction failure | #71 |
| 10. สถานะบนแบบฟอร์ม | Over-365 refusal, province mode, incomplete submit | #63 |
| 11. สถานะของแฟ้มคำขอ | Probe pending/failed, approve confirm, reject note | #65, #66 |
| 12. คิวว่างและเซสชัน | Both empty-queue states, session warning | #64, #65, #73 |
| 13. ค้นหาคำขอที่สิ้นสุดแล้ว | Read-only lookup by reference | spec §10.10 |
| 1b. ตรวจสอบคำขอก่อนส่ง | Check before submit | #63 |

**The canvas is built in Thai.** The layout risk this design exists to retire is
Thai text length, and it cannot be tested in English. The copy catalogue is still
authored in English (ADR 0010); the Thai on the canvas is a layout proxy for the
repo owner to correct, except the Disease group names, province names and
เขตสุขภาพ numbering, which come from the reference data and are authoritative.

### Decisions taken while designing

1. **Green is selection and the primary action, nowhere else.** No state colour
   is green, so a Reviewer can never confuse *this row is ready* with *this row
   is the one I clicked*. States are amber (a person is being waited on), blue
   (something you can act on), red (broken) and grey (nothing to do, whether
   queued, running or finished).
2. **The "ไม่ได้รับ" column is not styled as an error.** An Extract with no names
   in it is the correct outcome, and colouring it red teaches the opposite of
   what the block exists to say.
3. **The map is 13 contiguous region cells, schematic.** Region 13 is toned
   apart because Bangkok is a city inside another region's neighbourhood, not a
   peer area. It still needs a legend.
4. **There is no "check your request" step.** Submit goes straight to submit,
   which is the minimal reading of §16.4. Open decision 4 is settled by default,
   not by argument, so it is the cheapest one to reverse.
5. ~~**The confirmation restates the email address.**~~ **Reversed 2026-09-18
   (repo owner).** The check page (1b) now shows the address before submit, when
   a typo can still be fixed. After submit nothing can be done, so an echo on the
   confirmation could only reveal an unrepairable mistake while putting the
   address on a page anyone at the desk can read.

### Decisions taken in the state screens

6. **Two strengths of the selection colour.** Solid teal means *you chose this*;
   the teal wash means *this is context*. In province mode the province select is
   the choice and its health region is only tinted, because picking a province
   stores the province and never expands to the region.
7. **The probe's three states share one slot and one size.** *กำลังนับ* and
   *นับไม่สำเร็จ* are set in the same position and weight as the number, in the
   inert colour, so a missing count reads as a fact rather than as an error the
   Reviewer must resolve before deciding.
8. **An incomplete submit lists what is missing and keeps what was typed.** The
   summary names the fields rather than counting them, because the Requester has
   to find them on a long single page.
9. **The reject dialog says the note is not saved as you type.** A shared desk is
   the wrong place for that text to linger, and a Reviewer who does not know it
   is unsaved will leave it open.

### Two findings against the documents

- **There is no "replaced" collection screen, and there must not be one.** §9.4
  requires one page, one sentence, always identical for all four dead-token
  causes. A distinct *this link was replaced by a newer extract* page would tell
  someone walking the token space which guesses landed. The earlier design
  handoff had one.
- **ADR 0017 exists only in the design.** *A Reviewer never corrects a
  Requester's email address* is rendered on screen 6 as a stated absence, because
  the ADR is not in `docs/adr/`. Until it is, the canvas is the only record.
