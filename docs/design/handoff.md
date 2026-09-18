# Handoff: DDS Sharing

Specs for the twelve screens on the Lunagraph canvas `dds-sharing`. Tokens and
components are in [`system.md`](system.md) and are not repeated here; this file
covers layout, states, edge cases and accessibility per screen.

**Stack:** Angular SPA, one build, served by NestJS from the same origin
(ADR 0003). `/d/<token>` is NestJS, not Angular, and its path is fixed because
it travels in email. Copy comes from the Paraglide catalogue, never from
templates.

**Two things in this file are design intent that has not been drawn:** the
responsive rules in §Responsive, and the focus orders in §Accessibility. They
are specified rather than guessed at, but no screen below 1120px exists on the
canvas and no keyboard pass has been run. Treat them as decisions to implement,
not as verified layouts.

---

## Layout constants

| Surface | Frame | Content column | Gutter |
|---|---|---|---|
| Public (form, confirmation, duplicate) | 1120 | 1000 | `px-10` |
| Prose inside public | — | **720 max** | — |
| Reviewer queue | 1440 | `372px` + `minmax(0,1fr)` | header `px-6 py-3` |
| Sidebar rows | 372 | — | `px-5 py-4` |
| Dossier | — | fluid | `px-10 py-8` |
| Sign in | 1120 | 460 (card `px-8 py-8`) | — |
| Collection | 1120 | 680 | — |
| Expiry | 1120 | 620 | — |
| Email body | — | 680 | `px-6 py-5` |

Prose is capped at 720 because Thai at 15px runs to roughly 90 characters at
920, which is past comfortable measure. The cap is on paragraphs only; tables
and field grids use the full column.

---

## 1. Request form (#63)

### Order is a requirement, not styling (§16.4)

Gate notice → de-identification block → the two notices → the three parameters
→ contact fields → submit. **The de-identification block renders open, above the
form, and needs no interaction to read.**

### Layout

| Region | Spec |
|---|---|
| Header | `card` ground, `border-b border-border-strong`, brand + department line left, telephone right |
| H1 | `text-3xl font-semibold`, 720 max |
| Gate notice | three paragraphs, `gap-4`; the third has a 2px `pending` left rule and `pl-4` |
| De-identification | `border-t border-border-strong`, kicker row with "23 คอลัมน์ เท่ากันทุกคำขอ" right-aligned; two columns `gap-10`, each item `border-b border-border pb-2` |
| Notices | two-up grid `gap-10`, each `border-t border-border pt-4` |
| Disease group | `grid-cols-2 gap-x-10`, rows `border-b border-border py-3` |
| Date range | two 200px fields, `items-end gap-6`, live day count |
| Area | `Segmented`, then map 262×296 beside a 520 panel, `gap-10` |
| Contact | `grid-cols-2 gap-x-10 gap-y-6`; workplace full width |
| Submit | `border-t border-border-strong pt-6`, `Button primary lg` + one line of helper text |

### The region map

13 cells of 52×40 on a 2px lattice inside a 262×324 box, absolutely positioned,
with one caption beneath: **เขตสุขภาพที่ 13 คือกรุงเทพมหานคร**. Every cell has the same
fill. Region 13 used to be a darker grey to mark Bangkok as a city rather than a
peer area; removed 2026-09-18, because on a control a darker cell reads as
*disabled*, and the caption says what the shading only hinted at. **Schematic, not cartographic** — do not swap in
a geo file; a polygon map would put a geography dependency in the bundle for one
control.

| Mode | Map | Control |
|---|---|---|
| ทั้งประเทศ | all `land` | none |
| รายจังหวัด | selected province's region in `primary-wash` | the province select **is** the control; the map is presentational |
| เขตสุขภาพ | selected region solid `primary` | **the map is the control** — 13 radios |

> **Decision for the implementer:** in region mode the cells are the radiogroup,
> each with the accessible name `เขตสุขภาพที่ N`. In province mode the same cells
> are `aria-hidden` decoration. One component, two roles, switched by mode.

### States

| Element | State | Behaviour |
|---|---|---|
| Disease group row | selected | `primary-wash` ground, `border-b border-primary`, label `primary` + semibold |
| Date fields | span > 365 | both fields `border-failed`, day count in `failed`, message below with 2px `failed` rule. **Refused inline, never split** |
| Date `to` picker | always | greyed beyond `from + 365 days`; the server re-checks and attributes the cap to upstream |
| Region tags | 7+ provinces | wrap to a second row. Normal case, not an overflow |
| Submit | incomplete | summary names the missing fields; each name jumps to its field; typed values are kept |
| Field | invalid | `border-failed` + message below in `failed` |

### Edge cases

- **Longest group name** `โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม` fits one line at 920; below that it wraps to two and the row grows. Do not truncate a group name, ever.
- **77 provinces** in one select, `name_th` + two-digit code. Codes occupy 10–96 and have no leading zero.
- **Never show a row count** on this surface. No exception.
- **No Report code** is visible or typeable anywhere here.

---

## 1b. Check before submit (#63)

The form's button is **ตรวจสอบคำขอ** and goes here, not to the server. 720 column.
The email address is the focal point: `text-3xl` on a `primary-wash` panel, with
the sentence that it cannot be changed after sending. Then the ask and the contact
details as field lists, then `Button primary lg` ส่งคำขอ beside `Button secondary lg`
แก้ไข.

- **Edit keeps everything typed.** Going back must not reset a single field.
- **Nothing is stored until ส่งคำขอ.** No draft, no reference number, no event.
- This is the only point a typo can be caught. After submit, nobody can fix one
  (ADR 0017, spec §16.4) — so the email panel is the one thing on this page that
  must not be made smaller or quieter.

## 2. Confirmation (#63)

Reference number is the focal point: `text-4xl figure` on a `primary-wash`
panel, 680 wide. Below it, the ask restated as a three-row field list — **no email address**; the check page (1b) already showed it when it could still be fixed, then two
notes side by side, then the telephone line.

- **Nothing in the address.** Client state only.
- **No receipt email exists**, so the page says the number reappears in the
  decision email. A Requester who closes the tab has lost it until then.
- Reads as *you are done*. No error styling anywhere on this page.

---

## 3. Duplicate suppression (#63)

Amber, not red — a hold, not a failure. **Shows no reference number, no submit
time and no status.** Suppression is keyed on IP and a สคร. office is one IP, so
the pending request may be a colleague's; showing its reference would be the
system showing one person another person's request. Decided with the repo owner
2026-09-18, consistent with `/submitted` holding nothing in its address and the
expiry page carrying no reference.

Two cases, each with its own heading: *you just pressed send twice or refreshed*
(your first request was saved), and *you have not sent a request* (it is probably
a colleague's; call if you cannot wait).

**Do not call it a rate limit** in code, comments, or copy.

---

## 4. Sign in (#64)

460 column, card `px-8 py-8`, three fields at `gap-5`, `Button primary lg
fullWidth`.

| Element | Spec |
|---|---|
| Fields | username, password, 6-digit code, **one form, submitted together** |
| Code field | `figure`, `letter-spacing: 0.3em` |
| Failure | one generic message for all three causes, 2px `failed` rule on `failed-wash`; second line says no lockout, backoff only |
| Notes | accounts seeded on the host; no email reset; the other Reviewer is the recovery path; the route is unlinked and `noindex` as tidiness, **not** security |

Never reveal which factor failed. The audit record keeps it; the screen does not.

---

## 5. Queue and dossier (#65, #66)

### Sidebar, three zones

A request is in **exactly one zone at a time** — whichever carries the action it
needs.

| Zone | Ground | Contents |
|---|---|---|
| Header | `card` | title, count, `Button secondary md fullWidth` refresh, staleness line with change count, "หน้านี้ไม่อัปเดตเอง" |
| Queue | `card` | pending only, **oldest first**, amber time-left on the leader |
| ต้องจัดการ | `pending-wash`, `border-y border-border-strong` | one card per alert, kind + reference + requester + assignee + age |
| กำลังดำเนินการ | `card` | approved, not terminal, **submit order**, with the suppression note above it |

Selected row: `primary-wash` with a 2px `primary` left rule, reference in
`primary`. **Selection follows the dossier** — if an alert is open, the alert
card carries the selection, not the queue row.

### Dossier

Two-column ledger (`gap-12`), then a three-cell strip on `border-y`, then the
judgement statement, then the actions on `border-t border-border-strong pt-6`.

> **The buttons sit below the identity fields and the ask, and must stay there.**
> Approve must not be reachable without passing what is being judged. This is
> the weak form deliberately — it costs a scroll, not a click. **Do not float
> the buttons, pin an action bar, or make the dossier's action row sticky.**

### Row count states

| State | Renders | Approve |
|---|---|---|
| counted | `129` at `text-3xl figure` | enabled |
| pending | `กำลังนับ`, `inert`, same size and slot | enabled |
| failed | `นับไม่สำเร็จ`, `inert`, same size and slot | enabled |

All three are the same size and position so a missing count reads as a fact, not
a blocker. **Nothing waits on the probe.**

### No drain estimate

Queue position (`มีคำขอรออยู่ก่อนหน้านี้ 3 รายการ`) is the only positional
information. Do not add a projected start or finish time.

---

## 6. Alerts, resend and re-run (#73, #74)

### Alert card

`pending-wash` with a 2px `pending` left rule. Kind, the silence described in
words, assignee by name, then **three outcome buttons** (`secondary md`) and one
line explaining why there is no free-text field: the counts are the only measure
of how often this happens.

| Alert | Outcomes |
|---|---|
| Extraction failed | ติดต่อผู้ขอแล้ว · ยุติเรื่อง |
| Collection lapse | ติดต่อผู้ขอได้แล้ว · ติดต่อไม่ได้ · ไม่ต้องทำอะไรเพิ่ม |
| Send abandoned | as collection lapse |

### Action gating

| Extraction state | Row reads | Resend | Re-run |
|---|---|---|---|
| `queued`, `running` | *ยังทำอะไรไม่ได้จนกว่าจะดึงข้อมูลเสร็จ* | disabled | disabled |
| `ready` | time left on the link | enabled | enabled |
| `failed` | *ดึงข้อมูลไม่สำเร็จ* | disabled | enabled |

**Disabled must always be accompanied by the sentence.** Without it a Reviewer
reads a greyed button as a broken screen.

> **There is no third action and there must not be one. A Reviewer cannot
> correct a Requester's email address** (ADR 0017). The resend control takes no
> address field. This is rendered on screen as a stated absence in `failed-wash`,
> because it is the absence most likely to be "fixed" by someone who has not
> read it.

---

## 13. Looking up a finished request (spec §10.10)

A search field in the sidebar header, above refresh: **ค้นหาด้วยเลขที่คำขอ**, exact
reference only. A Request still on the surface opens in its zone; a terminal one
opens read-only in the dossier:

- state tag in `inert` and **อ่านอย่างเดียว** on the header line;
- an `inert-wash` notice that the request has ended and nothing more can be done;
- the ask and the Snapshot's `workplace` beside the Decision, its Reviewer and the
  row count at the time;
- a files table (run, archive name, link state, attempts) and the event trail,
  newest first.

**Never the contact fields** for a terminal Request (ADR 0015). **Never a search by
person** — that is the prior-Request history §10.2 declined.

---

## 7–8. Collection and expiry (#71)

### Collection, a server-rendered page (ADR 0018)

`GET /d/<token>` renders this page from a NestJS template, with catalogue
strings and **no Angular bundle and no required script**. Opening it is a lookup,
audited but **not an Attempt**. The button is a link to `GET /d/<token>/archive`,
which counts the Attempt and streams with range support.

680 column. Reference, file name, size, **ดาวน์โหลดแล้ว** (downloads used of 10),
`Button primary lg`, with time left beside it in `ready` and the deletion note
beneath. Three notes below: what is in the zip, that the link is the only
credential and must not be forwarded, and that every download is recorded, that
**opening the page does not count**, and that nothing extends the 72 hours.

There is **no loading state** on the download button: the browser shows the
download itself, and a server-rendered page has no script to show one with.

### Expiry

620 column. **One sentence, the telephone number, nothing else. Identical for
all four causes** — expired, attempts exhausted, object deleted, token never
existed. They are distinguished in the audit record and nowhere else.

- **No reference number.** A token that never existed has none, and printing it
  where we have it tells someone walking the token space which guesses landed.
- **No resubmit link and no prefill**, in the page or the email.
- Calm, not red. For the Requester this is a dead end, not a fault they caused.

---

## 9. The four emails (#71)

Each body is 680 max, `px-6 py-5`, header grid `px-6 py-4` on `border-b`. All
wording comes from the catalogue.

| Email | To | Carries | Must not carry |
|---|---|---|---|
| Delivery | Requester | download button, the ask restated, 72h terms, zip contents, do-not-forward | **any row count**; the file itself |
| Queue notification | every Reviewer | requester name, workplace, deadline | patient data; a download link |
| Rejection | Requester | that it was not approved; that they may resubmit; telephone | **any reason**, ever |
| Extraction failure | approving Reviewer | that the Requester has received nothing and does not know; that the operator is told separately | a demand that the Reviewer fix the fault |

Email HTML: single column, no CSS grid, no web fonts, inline styles, 600–680px
table. The canvas shows them two-up for review only.

**The emails have never been rendered by a mail client.** They are canvas
mockups. Testing them in Gmail web, the Gmail app, Outlook.com and Outlook desktop
is an acceptance criterion of #71, because the real templates are built there and
that is where email layout breaks.

---

## Loading states (screen 14)

Every button that waits on the server uses Button's `loading`: the label becomes
its in-progress form, the button keeps its size, and a second press is ignored.

| Where | Loading label | While loading |
|---|---|---|
| Check page, ส่งคำขอ | กำลังส่ง… | แก้ไข disabled: the Request may already be stored |
| Queue, โหลดรายการใหม่ | กำลังโหลดรายการ… | **the old list stays visible**; the line under the button says how old it is |
| Approve dialog | กำลังอนุมัติ… | ย้อนกลับ disabled: an approval that has gone cannot come back |
| Reject dialog | กำลังบันทึก… | ย้อนกลับ disabled |
| Resend, re-run | กำลังส่ง…, กำลังเริ่ม… | — |
| Sign in | กำลังเข้าสู่ระบบ… | fields read-only |
| Lookup | กำลังค้นหา… | — |

**A failed refresh says how old the list is**, not only that something went wrong:
*โหลดรายการไม่สำเร็จ · รายการด้านล่างเป็นของเมื่อ 8 นาทีที่แล้ว*. The Reviewer's real
question is whether they can trust what they see.

No skeletons and no spinners anywhere. Nothing in this service loads long enough
to need one, and the queue never blanks.

---

## Responsive

Decided with the repo owner 2026-09-18 (spec §16.1).

**Public surface: down to 360px.** Drawn at 390 as screens **1m** (form) and **7m**
(collection). The rules:

- 16px side gutters (`px-4`); page title drops to `text-2xl`.
- Every two-column block stacks to one: included/excluded, the two notices, the
  Disease groups, the contact fields.
- The two date fields sit side by side at 163px each; the day count wraps below.
- The map keeps its 262×296 size and sits above its panel. It never scales down:
  52×40 cells are already near the 44px touch minimum.
- The primary button goes full width on the collection page, where it is the only
  thing a thumb needs to reach.
- A long archive name moves below its label rather than squeezing beside it.
- The check page, confirmation, duplicate and expiry pages are single-column prose
  already; they need only the gutter and title changes.

**Reviewer surface: 1024px and up, nothing below.** Under 1024 every Reviewer route
shows screen **R**: one heading, one sentence on why, and nothing else — no queue,
no partial layout. There is no tablet layout to build or test.

### The Disease group order is the markup order

On desktop the ten groups show as two columns, 1–5 and 6–10. **The markup must
still run 1 to 10**, with the columns made by `grid-flow-col grid-rows-5`, not by
interleaving the elements. Interleaved markup looks right at 1120px and is wrong
everywhere else: it reads 1, 6, 2, 7… to a keyboard, to a screen reader, and on a
phone. The design had this bug until 2026-09-18.

---

## Accessibility

Target is **WCAG 2.1 AA as a working standard, with no conformance claim made**
(§18.12 stands). Do not write a conformance claim into any document.

### Per screen

| Screen | Focus order | Notes |
|---|---|---|
| Form | header → gate → de-id block (static) → group radios (one tab stop, arrows within) → dates → area segmented → area control → contact → submit | error summary receives focus on failed submit and links to each field |
| Sign in | username → password → code → submit | error message is `role="alert"`; never announce which factor failed |
| Queue | header → refresh → zone 1 rows → zone 2 → zone 3 → dossier | selecting a row moves focus to the dossier heading. Zones are `<nav>` landmarks with accessible names |
| Dossier | heading → code disclosure → strip (static) → approve → reject | **approve must not be reachable before the identity fields in DOM order** — the visual rule and the tab order say the same thing |
| Dialogs | trap focus; Escape returns to the trigger; confirm is the initial focus | the reject note is `aria-describedby` the "never sent to the Requester" line |
| Collection | heading → download | — |

### Throughout

- Every figure is tabular; screen readers still read them as numbers, so dates
  carry a `<time datetime>` with the Gregorian value even though the display is
  Buddhist era.
- Region cells in region mode: `role="radio"`, name `เขตสุขภาพที่ N`; in province
  mode `aria-hidden="true"`.
- State tags are text, not colour alone. Every state colour is paired with a word.
- Contrast: `muted-foreground` on `background` is the tightest pair in the system
  and must be re-measured if either token moves.
- `prefers-reduced-motion` is honoured globally; the only motion is
  `transition-colors` on controls.

---

### From the audit (`accessibility.md`)

- **Disabled resend and re-run use `aria-disabled="true"`, not `disabled`**, so
  they stay focusable, and `aria-describedby` points at the sentence saying why.
  A plain `disabled` button is skipped by the keyboard, and the reason goes with it.
- **The two date fields share one error**: both get `aria-invalid="true"` and
  `aria-describedby` → the shared message.
- **Status messages**: session and idle warnings `role="alert"`; the refresh
  result `aria-live="polite"`; the error summary takes focus on a failed submit.
- **Region cells are framed in `muted-foreground` when the map is the control**
  (region mode). The frame is what makes each cell a visible target; province
  mode, where the map is decoration, keeps flat cells.
- **`<html lang="th">`**, and one `<title>` per route from the catalogue.
- **Field is a native `<input>` with `<label for>`.** The design component draws
  a box; the Angular one must be a labelled input.

## What is not specified here

- **The province select is not a component** — there is no Select yet.
- **No screen below 1120px exists.** See §Responsive.
