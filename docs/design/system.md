# The design system

**Locked 2026-09-30 from Requester-form variant B, "Map-first split".** It
replaces the square "surveillance map" system everywhere, the Reviewer surface
included. B was drawn in the Lunagraph project `dds-prototype`, and the working
prototype is `apps/web/src/app/requester/request-form.prototype/variant-b.ts`.

The tokens are `source/globals.css` and the components are `source/components/`.
This file is the written form of both, and the Angular build is written against
it. **Until the Lunagraph project `dds-sharing` is redrawn in this system, this
file is newer than that canvas.** Where they disagree, this file is right.

## What B changed, in one paragraph

The old system was square, flat and teal, and it kept green out of every state.
B is soft: white cards with a large radius and one low shadow on a cool grey
page, a single blue accent, and green for "done". The map is no longer a small
control inside a form. It is the largest thing on the Requester's screen, and it
is always clickable.

## Tokens

### Colour

| Token | Value | Used for |
|---|---|---|
| `background` | `#e4e6ea` | the page |
| `card` | `#ffffff` | a surface lifted off the page: the form card, a dialog, a map cell, a secondary button |
| `foreground` | `#1b1d24` | body ink |
| `muted-foreground` | `#5f6470` | secondary text, hints, captions |
| `border` | `#dfe1e6` | hairline dividers **only**. It is 1.31:1, so it is never the only edge of a control |
| `input` | `#7a7e88` | the edge of anything you type into or press: fields, secondary buttons, map cells |
| `on-dark` / `on-dark-muted` | `#e4e6ea` / `#a9adb6` | **unused since 2026-09-30**: the Reviewer header is now `card`. Still defined in `source/globals.css`; do not carry them into the Angular stylesheet |
| `primary` | `#3b5bfd` | **the committed choice and the primary action. Nothing else.** |
| `primary-hover` | `#3050e8` | hover and active on the primary action |
| `primary-wash` | `#eef1ff` | *context*, not a commitment: the selected segment, a related region |
| `primary-foreground` | `#ffffff` | text on primary |

**The colour rule:** solid `primary` means *this is what you asked for*: the
selected region on the map, and the one action the screen exists for.
`primary-wash` with a `primary` edge means *this is the mode you are in*.
Everything else is `card` on `background`.

### Where B was changed for contrast

B's own values failed WCAG 2.1 AA in five places, and one was a one-off grey.
These are the only colour departures from B, and each is darker than what B drew.

| B drew | Now | Why |
|---|---|---|
| `#6b6f7a` muted text | `#5f6470` | 4.02:1 on the page; now 4.74:1 |
| `#dfe1e6` field and map-cell edges | `input` `#7a7e88` | 1.31:1 fails 1.4.11; now 3.25:1 on the page, 4.06:1 on a card |
| `#34c38f` checklist tick | `success` `#1a7a4f` | white tick on it was 2.25:1; now 5.33:1 |
| `#f0a92e` meter segment | `pending-bright` `#b7791f` | 2.02:1 on the card; now 3.64:1 |
| `#c9ccd3` segment edge | `input` `#7a7e88` | 1.5:1 against the page |
| `#8a8e98` unmet checklist mark | `inert` `#5f6470` | passed at 3.28:1, but mapped to the nearest state token rather than kept as a one-off grey |

### State

| State | Ink | Wash | Means |
|---|---|---|---|
| `success` | `#1a7a4f` | `#e6f4ec` | done, complete, ready to act on |
| `pending` | `#8a5a00` | `#fdf3dc` | a person is being waited on, or partly complete |
| `failed` | `#c42b3a` | `#fbe9eb` | broken, or required and missing |
| `inert` | `#5f6470` | `#eceef2` | nothing to do, whether queued, running or finished |

Every ink passes 4.5:1 on its own wash and on `card`. `pending-bright`
(`#b7791f`) is for graphics only, never text.

The old `ready` tone was blue. Blue is now the accent, so `ready` is `success`:
a Request that is ready for a Reviewer is shown green.

### Type

`IBM Plex Sans Thai` with `IBM Plex Sans`, one family, **weights 400, 500 and
600**. B added 500 for field labels. Body is 15px at 1.65; headings drop to 1.35
because Thai sets taller than Latin.

| Role | Size / weight |
|---|---|
| Area headline beside the map | 32px / 600 |
| Card title | 18px / 600 |
| Field label | 14px / 500, with the required mark `*` in `primary` |
| Body, field value | 14–15px / 400 |
| Hint, caption, checklist | 12–13px / 400, `muted-foreground` |

**Every figure is tabular.** Dates, counts, reference numbers, hours left and
file names carry `font-variant-numeric: tabular-nums` via `.figure`.

### Geometry

| Token | Value | Used on |
|---|---|---|
| `radius-sm` | 6px | chip, tag, segment (B drew segments at 8px; one radius per kind of thing puts them with chips) |
| `radius-md` | 10px | field, button |
| `radius-lg` | 12px | map cell |
| `radius-xl` | 20px | card |

One radius per kind of thing. A screen never picks its own.

| Shadow | Used on |
|---|---|
| `shadow-card` | the card, and nothing else that is not a card |
| `shadow-focus` | a focused field's halo, beside its `primary` edge. The halo is decoration; the edge is what meets 3:1 |

**Motion:** `transition-colors` on controls, and one lift: a map cell rises 2px
on hover over 100ms. `prefers-reduced-motion` removes both.

## Layout: the map-first split

The Requester's page is two columns.

- **Left, the map pane.** 360px, set by the chip row. An eyebrow (*พื้นที่ที่ขอ*), the chosen area as a 32px
  headline, the two mode segments (with the province dropdown under them in
  province mode), the region map at full size, a caption in province mode only,
  and the province chips of the chosen region, wrapping within 360px. Sticky
  while the form scrolls.
- **Right, the form card.** 460px wide, 40px from the map pane. The split is
  860px of content, 972px with the page's 56px padding. Neither column shrinks. Icon header, the ask (group, dates),
  a divider, who is asking, then the requirement checklist and the actions.

Below 900px the columns stack, map first, and the map cells shrink to
52 × 42px.

## The Requester screens, as locked (2026-09-30)

**Source of truth: the Lunagraph page "Requester form: prototypes" in project
`dds-prototype`, reviewed and finalized by the repo owner on 2026-09-30.** Every
Requester screen and state below is a frame on that page. Where this section
and a frame disagree, the frame is right. The frame `B · Map-first split` is the
reference the tokens were locked from, not a screen.

### Screen 1: the request form

Top to bottom:

1. **Page title,** 28/600, alone. No gate paragraph, no 24-hour line, no
   no-reason notice.
2. **What the file contains.** A card, open and static: title, then two
   columns over a hairline: **ได้รับ** with `success` ticks, **ไม่ได้รับ** with
   ringed `inert` dashes. The excluded column is **not styled as an error**. No
   count tag, no lead line, no allowlist note: the repo owner cut all three.
3. **The map-first split.** Map pane left, form card right. The map caption is
   shown only in province mode; in region and whole-country mode the chips (or
   nothing) follow the map directly.
4. **Inside the form card:** group, dates, divider, contact fields, the
   requirement checklist, the PDPA consent block, then ล้างฟอร์ม and ส่งคำขอ.
   The email warning is the Field tooltip on อีเมลรับไฟล์; retention is the body
   of the consent block.

| Frame | State | What differs from the base |
|---|---|---|
| `1 · แบบขอข้อมูล` | **Base.** Region 4, partly filled, tooltip open | — |
| `… · ทั้งประเทศ` | Whole country | ทั้งประเทศ segment selected (wash, `primary` edge and text); no cell lit; no chips |
| `… · รายจังหวัด` | Province | เลือกจังหวัด selected; จังหวัด dropdown above the map (*สระบุรี (19)*); the province's region in `primary-wash` with a `primary` edge, never solid; caption *…แสดงไว้ให้เห็นตำแหน่งเท่านั้น · คำขอนี้เก็บเฉพาะจังหวัด…* |
| `… · ว่าง (เปิดครั้งแรก)` | First visit | Whole country (the default); placeholders only; checklist 1/5, one `failed` meter segment; PDPA unticked |
| `… · ครบพร้อมส่ง` | Complete | All filled; three `success` segments; label *พร้อมส่ง ครบทุกข้อ* in `success`; PDPA ticked (solid `primary` circle with a white tick, the block in `primary-wash` with a `primary` edge) |
| `… · ช่วงวันเกิน 365 วัน` | Span over 365 | Both date boxes `failed`; day count in `failed`; one shared panel below the pair (`failed-wash`, title *ช่วงวันที่ยาวเกินที่ขอได้* and the cap's reason); the date item fails in the checklist |
| `… · วันสุดท้ายก่อนวันแรก` | Reversed range | Both date boxes `failed`; no day count; one-line panel *วันสุดท้ายอยู่ก่อนวันแรก…* |
| `… · กดส่งแต่ยังไม่ครบ` | Submit with gaps | Each missing field gets a `failed` edge and one line under it; the checklist is wrapped in a 2px `primary` focus frame, headed *ยังส่งคำขอไม่ได้ ขาดข้อมูล 3 รายการ* in `failed` with the hint below, and its failing items are `failed`, bold and underlined as jump links |
| `1m · แบบขอข้อมูล · 390px` | Phone | One column: title 22px, the file-contents card with the columns stacked, the map (52 × 42 cells), then the form card; ส่งคำขอ full width above ล้างฟอร์ม |

Two states from the handoff are **not drawn, by decision**: region mode with
nothing picked (tapping the map picks a region, so it cannot occur), and a
failed send on the form itself (sending happens on 1b).

### Screen 1b: check before submit

A 640px card: title *ตรวจสอบคำขอก่อนส่ง*, the email panel (`primary-wash`,
`primary` edge, the address at 28/600 under *ไฟล์จะส่งไปที่*), then
*สิ่งที่ท่านขอ* and *ผู้ขอข้อมูล* as label/value rows over hairlines, then แก้ไข
(`secondary`) and ส่งคำขอ (`primary`) at 1 : 1.4. The repo owner cut the lead
line, the warning under the address, and the note under the buttons.

| Frame | State |
|---|---|
| `1b · ตรวจสอบคำขอก่อนส่ง` | Review |
| `… · กำลังส่ง` | ส่งคำขอ reads *กำลังส่ง…* on `primary-hover`; แก้ไข disabled at 45% |
| `… · ส่งไม่สำเร็จ` | A `failed-wash` panel above the buttons with the submit-failed message and the phone number; both buttons live again |

### Screen 2: confirmation

A `success` circle and *ส่งคำขอเรียบร้อยแล้ว*, the reference number at 40/600 in
a `primary-wash` panel with the keep-this-number note, the ask as three rows
(no email), two bordered notes (*ผลการพิจารณา*, *หากอนุมัติ*), and the phone
line.

### Screen 3: duplicate refused

Amber, one case (spec §4.8 as narrowed on 2026-09-30, ticket #102): the `pending`
ringed mark and *ท่านส่งคำขอนี้ไปแล้ว*; a `pending-wash` panel saying the Request
was saved and where its reference is; a bordered panel saying a different ask or
a corrected email goes through, with a `secondary` *กลับไปแก้ไขคำขอ*. **No
reference number, submit time or status.**

### Screens 7, 7m and 8: collection and expiry

- **7 · หน้าเก็บไฟล์:** reference above the title; a file panel with the archive
  name and size, *ดาวน์โหลดแล้ว 2 จาก 10 ครั้ง* on `#f7f8fa`, time left in
  `success` on `success-wash`, a full-width `primary` ดาวน์โหลดไฟล์ and the
  deletion note; three bordered notes (zip contents, do not forward with a
  `pending` mark, every download recorded); the phone line. No loading state.
- **7m:** the same at 390px, the archive name on its own line below *ชื่อไฟล์*,
  the notes as headed paragraphs over a hairline.
- **8 · ลิงก์ใช้ไม่ได้:** a 560px centred card, a grey broken-link mark, one
  sentence and the phone number. Identical for all four causes; no reference.

### Screen 9: the Requester's emails

680px body under a from / to / subject header over a hairline.

- **Delivery:** greeting, the approval line, a `primary` ดาวน์โหลดไฟล์, the ask
  in a bordered box, the 72-hour terms, and the zip note with *do not forward* in
  `pending` on `pending-wash`. **No row count.**
- **Rejection:** greeting, the outcome on an `inert-wash` panel (calm, not
  red), no reason, the phone line.

> **The spec needs amending to match these screens.** §16.4 orders gate notice
> → de-identification → the two notices → form, and the approval gate is no
> longer stated on screen 1. The de-identification block has lost its *no names
> is the correct result* line, which the brief called a requirement. 1b has lost
> the warning that the address cannot be changed after sending. The canvas wins;
> the spec follows.

## The Reviewer screen, as locked (2026-09-30)

**Source of truth: the frame `5 · คิวและแฟ้มคำขอ` on the Lunagraph page
"Requester form: prototypes" in project `dds-prototype`.** It was picked by the
repo owner on 2026-09-30 from three layouts drawn in this system: a split with
the queue on the left, a dossier headed by a judgement panel, and this one. The
other two were deleted. Where this section and the frame disagree, the frame is
right. It covers screen 5 (#65, #66) in its pending state only; the confirms,
the reject note, the three row-count states and the empty queues are not yet
drawn in this system.

### Layout: the queue above, the dossier below

A 1440px frame, one card (`radius-xl`, `shadow-card`) on `background` with 48px
page padding. Top to bottom:

- **Header.** `card`, a `border` hairline beneath, `16px 28px`. *DDS Sharing*
  (16/600) and *ผู้ตรวจสอบ* (13, `muted-foreground`) left; the Reviewer's name
  and *ออกจากระบบ* in `primary` right. **Not dark.** This supersedes the dark
  Reviewer header; `on-dark` and `on-dark-muted` have no user left.
- **Queue band.** `#f7f8fa`, a `border` hairline beneath, `20px 40px`.
  - One row: the **zone tabs** left and the staleness line (*อัปเดตเมื่อ 6
    นาทีที่แล้ว. รายการนี้ไม่รีเฟรชเอง*, 12, `muted-foreground`) beside a
    `secondary` **↻ รีเฟรช** right.
  - The **queue table**: a `card` with a `border` hairline and 12px radius
    (`radius-lg`), columns 220 / fluid / 200 / 180 / 160: ผู้ขอ, หน่วยงาน,
    กลุ่มโรค, ส่งเมื่อ, เวลาที่เหลือ. The header row is 12px `muted-foreground`;
    body rows are 14px at `10px 20px` over hairlines. **Oldest first.** The
    selected row is `primary-wash` with a 3px `primary` left rule and the name
    at 600.
- **Dossier.** `36px 40px 48px`, 28px between its parts:
  1. **Header row.** Left: the reference (13, `muted-foreground`) over the
     Requester's full name at 26/600. Right: three stacked label/value cells
     32px apart, *ส่งเมื่อ*, *เวลาทำการที่เหลือ*, *ก่อนหน้า* (label 12
     `muted-foreground`, value 14 `foreground`, all `figure`).
  2. **Two columns**, 1fr 1fr, 40px apart. Left *ผู้ขอข้อมูล*: the five contact
     fields as separate rows (ชื่อ, นามสกุล, หน่วยงาน, โทรศัพท์, อีเมล). Right
     *สิ่งที่ขอ*: กลุ่มโรค with **▸ รหัสรายงาน N รหัส** beneath it in `primary`
     (13px, collapsed), ช่วงวันที่, พื้นที่ as the area name and a province
     count (*เขตสุขภาพที่ 4 · 8 จังหวัด*, no chips), and จำนวนแถว. Section
     titles 16/600; rows are the 1b label/value row (label column 120px,
     `10px 0`, `border` hairline above, one below the last).
  3. **Decision strip.** A `border` hairline above, 24px padding-top, one row.
     Left, 640 max: the judgement question (14, `foreground`) over *ถ้าไม่แน่ใจ
     โทรหาผู้ขอก่อนตัดสิน. การอนุมัติย้อนกลับไม่ได้* (12, `muted-foreground`).
     Right: `secondary` **ไม่อนุมัติ** (180px) then `primary` **อนุมัติและปล่อยข้อมูล**
     (260px), both `lg`, 12px apart.

**The strip sits below both columns, and that is the requirement.** On a
1440 screen the two columns end at the same line, so Approve is past the
identity fields *and* the ask whichever column a Reviewer reads. In tab order
the strip comes after the right column. Do not float, pin or make it sticky.

### The zone tabs

The three zones (§10.1) are one segmented control, not three sidebar sections:
**รอตัดสิน · 4**, **ต้องจัดการ · 1**, **กำลังดำเนินการ · 3**. A track of
`inert-wash` (`#eceef2`) with 4px padding and a 10px radius; the selected tab
is `card` with 600 text and a 1px shadow, the others `muted-foreground`. Each
tab carries its count, so an open Alert is visible from the queue without a
badge. The table beneath shows the selected zone only, so a Request still
appears in exactly one place.

Accessibility: `role="tablist"` over `role="tab"` with `aria-selected`, arrow
keys between tabs, one tab stop; the table is the `tabpanel`.

### Where the drawing is not the build

| Drawn | Build it as | Why |
|---|---|---|
| ไม่อนุมัติ and ↻ รีเฟรช with a `border` hairline edge | `Button secondary`, on the `input` edge | a hairline is 1.31:1 and never the only edge of a control |
| buttons 48px high | `lg`, 44px | one height per size |
| ไม่อนุมัติ / อนุมัติ at 180 / 260px | the same fixed widths | the one place the pair does not use the 1 : 1.2 grid, because the strip shares its row with the question |
| ↻ and ▸ as text glyphs | line icons from the app's icon set | the design tool had no icon library |
| tabs at an 8px radius | `radius-sm` | a tab is a segment |
| the queue rows as grids of spans | a `<table>` with row headers, the row a button or link to its dossier | a table read as a table |

## Component: Button

Three variants, two sizes, and nothing else. All `radius-md`.

| Variant | Visual | Use when |
|---|---|---|
| `primary` | solid `primary`, white 600 text | the one action the screen exists for. One per screen |
| `secondary` | `card` fill, `input` edge, `foreground` text | a real action that is not the point of the screen: clear the form, reject, resend, re-run |
| `quiet` | no fill, `input` edge, `muted-foreground` text | disclosure and dismissal. Reveals or closes something, never changes a record |

| Size | Height / padding | Use when |
|---|---|---|
| `md` | 40px, `px-5` | the default |
| `lg` | 44px, `px-8`, 16px text | the action the screen is named after |

Paired actions sit in a grid, secondary then primary, at 1 : 1.2 (B's
ล้างฟอร์ม / ส่งคำขอ). `fullWidth` exists for sign-in and the sidebar refresh.
**There is deliberately no `sm`.**

### States

| State | Visual | Behaviour |
|---|---|---|
| Default | per variant | — |
| Hover | primary → `primary-hover`; others tint `primary-wash` | — |
| Active | primary `primary-hover`; others `primary-wash` with a `primary` edge | — |
| Focus | 2px `primary` outline, 2px offset | keyboard only, via `focus-visible` |
| Disabled | 45% opacity, `not-allowed` | **must be accompanied by a sentence saying why** |

> **Disabled is load-bearing on the in-flight list.** Resend and re-run are
> disabled while a job is `queued` or `running`, and the row says *"ยังทำอะไรไม่ได้
> จนกว่าจะดึงข้อมูลเสร็จ"*. A disabled button without that sentence is a bug.

### Loading

`loading` with a `loadingLabel` replaces the label with its in-progress form:
ส่งคำขอ becomes **กำลังส่ง…**. **No spinner.** The button keeps its variant and
width, is `aria-busy`, stays focusable, and ignores a second press. While a
primary action is loading, the escape beside it is disabled.

### Do and don't

| ✅ Do | ❌ Don't |
|---|---|
| One `primary` per screen | Two primaries side by side |
| `secondary` for reject | A red variant. Rejection is a normal outcome |
| Disable with a reason in words | Disable and leave the person guessing |

## Component: Card

The white surface a task sits on: `card`, `radius-xl`, `shadow-card`, 24px
padding, 14px between rows. **One card per task.** A card never sits inside a
card.

**Icon header:** a 48px circle with a `border` hairline holding a 20px line
icon, then the title (18/600) and one line of subtitle in `muted-foreground`.
A hairline divider closes the header. The subtitle is where the approval gate
is stated on the Requester's card.

## Component: Field

A label above, a 44px box, and **at most one line beneath it**. An error
replaces the hint rather than stacking on it.

- **Label:** 14/500 `foreground`, required mark `*` in `primary`. A small
  right-aligned aside may sit on the label row: a live count (*92 วัน*) or a
  quiet clear action (*ล้าง*).
- **Box:** `card` fill, `input` edge, `radius-md`, 14px horizontal padding.
- **Focus:** `primary` edge plus `shadow-focus` halo.
- **Error:** `failed` edge and the message in `failed` below.
- **Placeholder:** an example of the answer, never the label again
  (*เช่น สคร.1 เชียงใหม่ กลุ่มระบาดวิทยา*).

| Prop | Use |
|---|---|
| `hint` | the one line of guidance, when there is no error |
| `error` | the message, which also turns the edge `failed` |
| `invalid` | the `failed` edge with **no** message, for fields that fail together and share one message (the two dates of a range that is too long) |
| `figure` | tabular figures, for dates and telephone numbers |
| `code` | tabular and widely tracked, for the six-digit sign-in code |

Related fields pair on one row (first and last name, from and to). A hairline
divider separates *the ask* from *who is asking*.

## Component: Field tooltip

Extra warning on one field, kept out of the way until asked for. Used once:
the email warning on อีเมลรับไฟล์.

- **Trigger:** a 16px circle, `pending` fill, white `!` (10/700), right after
  the label's required mark.
- **Tooltip:** `foreground` (`#1b1d24`) panel, 320px, `radius-md`, 12px × 14px
  padding, shadow `0 12px 32px rgb(0 0 0 / 0.18)`, a 10px rotated-square
  pointer at the trigger. Title 13/600 white; body 12px at 1.5 in `#c9ccd3`
  (10.47:1 on the panel). Opens below the label, over the box.

Build: the trigger is a `<button>` with `aria-describedby` on the input pointing
at the tooltip, so the warning is read with the field. It opens on hover **and**
focus, closes on Escape, and stays open while hovered (WCAG 1.4.13).

## Component: Consent block

The PDPA acknowledgement, between the requirement checklist and the actions.

- **Box:** `#f7f8fa` fill, `border` hairline, 12px radius (`radius-lg`), 14px padding, 8px above it.
- **Control:** an 18px circle, 1.5px edge, white fill, top-aligned. Drawn as
  `#9aa0ab` (2.63:1); build it on `input` (`#7a7e88`) to meet 3:1.
- **Label:** 14/600 *ข้าพเจ้าได้อ่านและยอมรับ* then the link
  **ประกาศความเป็นส่วนตัว (PDPA)** in `primary`, underlined.
- **Body:** 13px `muted-foreground`, the retention sentence.

Build: one agreement is a **checkbox**, not a radio, even though it is drawn
round. Two things the drawing does not settle: whether ส่งคำขอ requires it
(and so whether the checklist gains a sixth item), and where the PDPA notice
link goes.

## Component: Region map

The Requester's area control, and the largest thing on their screen. Thirteen
cells on a **4 × 7 lattice**, schematic rather than cartographic. The east
branch sits directly against the west one, with no empty column between them:

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
|---|---|---|---|---|
| 1 | | 1 | | |
| 2 | | 2 | 8 | |
| 3 | | 3 | 7 | |
| 4 | | 4 | 9 | 10 |
| 5 | 5 | 13 | 6 | |
| 6 | 11 | | | |
| 7 | 12 | | | |

This is tighter than the 5 × 7 `LAYOUT` in
`apps/web/src/app/requester/region-map.component.ts`, which still leaves a gap
column and puts 8, 7, 9 and 10 one column further right. The build must move to
this lattice.

| State | Visual |
|---|---|
| At rest | `card` fill, `input` edge, `radius-lg`, no shadow, the number 16/600 in `muted-foreground` |
| Hover | lifts 2px; edge and number turn `primary` |
| Selected | solid `primary`, white number. **The only solid accent on the map** |
| Related | `primary-wash`, for the region of a chosen province |

Cells are 72 × 56px with a 6px gap, and 52 × 42px below 900px.

**Always clickable.** Pressing a cell switches Area to that health region,
whatever mode was showing. The two segments above the map (*ทั้งประเทศ*,
*เลือกจังหวัด*) are the only other ways in. In region mode the chips below the
map list the provinces the region is stored as; there is no caption. In
province mode one caption says the region is shown for location only.

Accessibility: `role="radiogroup"` over `role="radio"` with `aria-checked`,
arrow keys between cells in number order, one tab stop. The locked screens
drop the visible *เขตสุขภาพที่ 13 คือกรุงเทพมหานคร* caption, so cell 13's
accessible name must say it (*เขตสุขภาพที่ 13 กรุงเทพมหานคร*): 13 sits out of
reading order and a screen-reader user needs the reason.

## Component: Segmented

The Area modes beside the map: separate `radius-sm` buttons, not one joined
bar. Unselected: `card` fill, `input` edge. Selected: `primary-wash` fill,
`primary` edge and text. The selected segment is a mode, not the answer; the
answer is the solid cell on the map. Accessibility as before: radiogroup, arrow
keys, one tab stop.

## Component: Requirement checklist

B's replacement for the error summary. It sits at the foot of the form card,
above the actions, and is **always visible**, not only after a failed submit.

- **Meter:** three 4px segments. 0 of 5 met: none lit. 1–2: one lit, `failed`.
  3–4: two lit, `pending-bright`. 5: all lit, `success`.
- **Label:** *คำขอยังไม่ครบ (4/5) ต้องมี:*, or *พร้อมส่ง ครบทุกข้อ* when complete.
  The count is in words, so the meter's colour is never the only signal.
- **Items:** a 16px circle then the requirement. Met: `success` fill, white
  tick. Unmet: `inert` fill, white cross.

The five items are the form's rules in the Requester's words: one Disease
group; a date range of at most 365 days; an area (or the whole country); name,
surname and Workplace; a telephone and an email that reach them.

Pressing ส่งคำขอ with items unmet moves focus to the checklist and gives each
unmet field its `failed` edge. The checklist is a live region, `aria-live="polite"`,
announced only when the count changes.

## Component: Tag

The state of a Request, and nothing else. Filled, ink on its own wash,
`radius-sm`, always a word and never colour alone.

| Tone | Means |
|---|---|
| `success` | ready to act on |
| `pending` | a person is being waited on |
| `failed` | broken |
| `inert` | nothing to do, whether queued, running or finished |

`sm` in list rows, `md` beside a heading.

## Component: Chip

A value that belongs to what the Requester chose: the provinces a region expands
to. `card` fill, `border` hairline, `radius-sm`, 12px text. Not interactive. It
must not look like a Tag, because a Tag reports what the system is doing and a
Chip lists what was asked for. Here the hairline is fine, because a chip is not
a control.

## A canvas rendering fault, still guarded

On the Lunagraph canvas, class border colours render grey because an unlayered
reset beats Tailwind's layered utilities. `source/globals.css` states the border
colours unlayered to get round it, and gives the focused field its edge the same
way. Delete that block if the Angular build renders borders without it.

## Still undone

- **`apps/web/src/styles.css` is still the old system.** The Angular build moves
  to these tokens when the Requester page is rebuilt from B.
- **The font weight 500 is not loaded.** `angular.json` loads only 400 and 600
  from `@fontsource`; add 500.
- **The Lunagraph project `dds-sharing` has not been redrawn.** Its twelve screens,
  and every screenshot in `handoff.md`, still show the square teal system.
- **`accessibility.md` P2 and P3 are resolved by `input`** (quiet-button frame,
  map-cell edge). Re-measure the rest against these tokens.
- **The Reviewer surface has one screen drawn in this system**, screen 5's
  pending state (see "The Reviewer screen, as locked"). Sign in, the confirms
  and reject note, the row-count states, the empty queues, the Alert and
  in-flight zones, and the lookup take these tokens and components but have no
  drawing yet.
- **The province select is still hand-built.** There is no Select component.
