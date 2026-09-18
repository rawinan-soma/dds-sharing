# The design system

The tokens live in the Lunagraph project's `app/globals.css` and the components
in `components/`. This file is the written form of both, and it is what the
Angular build should be written against. Where this file and the canvas
disagree, the canvas is the newer of the two — check it.

## Tokens

### Colour

| Token | Value | Used for |
|---|---|---|
| `background` | `#eef1ee` | the page, and the map's ground |
| `card` | `#f7f9f7` | a panel lifted off the ground: sidebar, dialog, email body |
| `foreground` | `#16241e` | body ink, hairline-strong rules, the one dark field |
| `muted-foreground` | `#556159` | secondary text, field labels |
| `border` | `#c8d0c9` | hairline rules between rows |
| `border-strong` | `#16241e` | the frame of an input, a panel or a control |
| `on-dark` / `on-dark-muted` | `#eef1ee` / `#a8b5ac` | text on the Reviewer header, the only dark field |
| `land` / `land-strong` | `#d9e0da` / `#c2ccc4` | inert map fill, and the hover/active tint of any control |
| `primary` | `#0c6b63` | **selection, and the primary action. Nothing else.** |
| `primary-hover` | `#0a5751` | hover and active on the primary action |
| `primary-wash` | `#dceceb` | *context*, not choice: a tinted region, a selected row, a callout |
| `primary-foreground` | `#f7f9f7` | text on primary |

**The colour rule that governs everything:** solid `primary` means *you chose
this*; `primary-wash` means *this is related to what you chose*; everything
inert is `land`. This is why no state colour is green.

### State

| State | Ink | Wash | Means |
|---|---|---|---|
| `pending` | `#7f5300` | `#f6eedc` | a person is being waited on |
| `ready` | `#2b5b86` | `#e4edf4` | there is something here you can act on |
| `failed` | `#8c2b20` | `#f6e6e3` | broken |
| `inert` / `running` | `#5a6862` | `#e6e9e6` | nothing to do, whether queued, running or finished |

`running` and `inert` are deliberately the same value. A job that is extracting
and a request that is finished are the same thing to a Reviewer: not their turn.

### Type

`IBM Plex Sans Thai` with `IBM Plex Sans`, one family, weights 400 and 600 only.
Body is 15px at 1.65; headings drop to 1.35 because Thai sets taller than Latin.

**Every figure is tabular.** Dates, counts, reference numbers, hours left and
file names all carry `font-variant-numeric: tabular-nums` via the `.figure`
class, because in this interface every figure is read against another figure.

### Geometry

**There are no radius tokens and the system is square everywhere.** The surfaces
are map ground and field rules, not cards. A rounded corner is a decision to
take, not a token to reach for.

No shadows, no elevation. Depth is carried by hairlines and by `card` against
`background`.

No motion tokens. The only transitions are `transition-colors` on controls, and
`prefers-reduced-motion` is honoured globally.

## Component: Button

Three variants, two sizes, and nothing else. This component exists because the
design had drifted to five paddings and three border weights with no rule.

| Variant | Use when |
|---|---|
| `primary` | the one action the screen exists for. One per screen. The only place the saturated colour appears on an action |
| `secondary` | a real action that is not the point of the screen: reject, resend, re-run, refresh, an alert outcome |
| `quiet` | disclosure and dismissal. Reveals or closes something, never changes a record. Framed in `muted-foreground` so its only boundary meets 3:1 |

| Size | Padding | Use when |
|---|---|---|
| `md` | `px-5 py-2 text-sm` | the default |
| `lg` | `px-8 py-3 text-base` | the action the screen is named after |

`fullWidth` exists for two places only: the sign-in button, and the sidebar
refresh, where the column is too narrow for a label beside a timestamp.

**There is deliberately no `sm`.** Ending the five-padding sprawl is the whole
point of the component, and the first request for a fourth size should be
answered with a layout change instead.

### States

| State | Visual | Behaviour |
|---|---|---|
| Default | per variant | — |
| Hover | primary darkens to `primary-hover`; others tint `land` | a hover is never a choice, so it never uses the accent |
| Active | primary `primary-hover`; others `land-strong` | — |
| Focus | 2px `primary` outline, 2px offset | keyboard only, via `focus-visible` |
| Disabled | 45% opacity, no hover, `not-allowed` | **must be accompanied by a sentence saying why** |

> **Disabled is load-bearing on the in-flight list.** Resend and re-run are
> disabled while a job is `queued` or `running`, and the row says *"ยังทำอะไรไม่ได้
> จนกว่าจะดึงข้อมูลเสร็จ"*. A disabled button without that sentence beside it is a
> bug, because a Reviewer will read it as a broken screen.

### Loading

`loading` with a `loadingLabel` replaces the label with its in-progress form —
ส่งคำขอ becomes **กำลังส่ง…**, โหลดรายการใหม่ becomes **กำลังโหลดรายการ…** — and makes
the button inert while it waits. **No spinner**: the words say what is happening,
and every round trip in this service is short. The button keeps its variant and
width, so nothing around it moves. It is `aria-busy` and stays focusable; a
second press is ignored, never sent twice.

While a primary action is loading, **the escape beside it is disabled**: แก้ไข on
the check page and ย้อนกลับ in the approve dialog. The action may already have
been recorded, and offering a way back would be a lie.

### Do and don't

| ✅ Do | ❌ Don't |
|---|---|
| One `primary` per screen | Two primaries side by side |
| `secondary` for reject | A red or "destructive" variant. Rejection is a normal, correct outcome |
| `quiet` for ย้อนกลับ and ปิดข้อความ | A bare text link that is really an action |
| Disable with a reason in words | Disable and leave the Reviewer guessing |

## Component: Segmented

A small closed set of mutually exclusive choices where seeing all of them at
once is the point. Used once, for Area: whole country, one province, one health
region. Never both, never two.

The selected segment is the only saturated thing in the control. Hover tints an
unselected segment with `land`, never with the accent. Dividers and frame are
`border-strong` so the control reads as one object rather than three buttons
that happen to touch.

Accessibility: `role="radiogroup"` over `role="radio"` with `aria-checked`,
arrow keys between segments, one tab stop for the group.

## Component: Field

A label, a value box, and **at most one line beneath it**. An error replaces the
hint rather than stacking on it: a Requester reading two lines under one box
reads neither.

| Prop | Use |
|---|---|
| `hint` | the one line of guidance, when there is no error |
| `error` | the message, which also turns the frame `failed` |
| `invalid` | the `failed` frame with **no** message, for fields that fail together and share one message below them (the two dates of a range that is too long) |
| `figure` | tabular figures, for dates and telephone numbers |
| `code` | tabular and widely tracked, for the six-digit sign-in code |
| `onCard` | swaps the fill so the box contrasts what it sits on: `card` on the page, `background` inside a card |

The frame is `border-strong`, dark ink. It reads as a drafted field, not a
floating card, and it is the heaviest line on a form screen on purpose: the
fields are the work.

## Component: Tag

The state of a Request, and nothing else. Filled, ink on its own wash, always a
word and never colour alone.

| Tone | Means |
|---|---|
| `pending` | a person is being waited on |
| `ready` | there is something here you can act on |
| `failed` | broken |
| `inert` | nothing to do, whether queued, running or finished |

`sm` in list rows, `md` beside a heading.

## Component: Chip

A value that belongs to what the Requester chose: the provinces a region expands
to. **Outlined in `primary`, never filled**, so it cannot be mistaken for a Tag. A
Tag reports what the system is doing; a Chip lists part of what was asked for.
The solid fill stays reserved for the choice itself. Not interactive.

## A canvas rendering fault, and the fix in the token file

Until 2026-09-18 **no border colour rendered on the design canvas**. Every border
showed a default grey while fills and text were right, so every screenshot up to
then showed grey where the design specified ink, amber, red or teal. The cause is
an unlayered reset on the canvas beating Tailwind's layered utilities. The token
file now states the seven border colours unlayered, with a comment saying why.

In the Angular build this block is probably unnecessary. Check whether class
borders render without it, and delete it if they do.

## Still undone

- **The province select on screen 10 is still hand-built.** It is a Select, not
  a Field, and there is no Select component yet.
- **The page header is copied five times** across the public and Reviewer roots.
- **No accessibility pass has been run** on the composed screens; the focus
  order and the keyboard path through the split queue are unverified.
