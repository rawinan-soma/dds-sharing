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

13 cells of 52×40 on a 2px lattice inside a 262×296 box, absolutely positioned.
Region 13 is `land-strong` because Bangkok is a city inside another region's
neighbourhood, not a peer area. **Schematic, not cartographic** — do not swap in
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

### Collection, served by NestJS

680 column. Reference, file name, size, attempts used, `Button primary lg`, with
time left beside it in `ready` and the deletion note beneath. Three notes below:
what is in the zip, that the link is the only credential and must not be
forwarded, and that every presentation is logged and never extends the clock.

Supports range requests: a dropped สคร. connection resumes rather than restarts.

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

---

## Responsive

**Not drawn. Specified here as intent.** The public surface is one column
already and degrades naturally; the Reviewer surface is desktop-first and is the
real work.

| Breakpoint | Public | Reviewer |
|---|---|---|
| ≥1200 | as drawn | as drawn, split |
| 1024–1199 | as drawn | sidebar to 320, dossier ledger stays two-column |
| 768–1023 | two-column blocks stack: get/won't-get, disease groups, contact pairs | **split collapses to list-then-detail** — the queue is a screen, a request is a screen, with a back control. Not a drawer |
| <768 | 16px gutters, date fields stack, map centred above its panel, no horizontal scroll | same as above; the dossier strip stacks to three rows |

The map keeps its 262×296 intrinsic size and centres; it never scales below that,
because 52×40 cells are already near the 44px touch minimum.

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

## What is not specified here

- **Field / input is not yet a component** — it is repeated markup. Extract it
  before building, or the drift starts again on day one.
- **The state tag and the province tag share one shape.** One reports system
  state, the other lists a stored value. They should not look alike.
- **Loading states are undrawn.** The only genuinely async surfaces are the
  queue refresh and the download start; neither has a spinner specified.
- **No screen below 1120px exists.** See §Responsive.
