# Accessibility audit: DDS Sharing

**Standard:** WCAG 2.1 AA, as a working standard with **no conformance claim**
(spec §18.12 stands). **Date:** 2026-09-18. **Scope:** every screen on the Lunagraph
canvas `dds-sharing`, the tokens in `source/globals.css`, and the components.

> **2026-09-30: measured against the old tokens.** `system.md` now carries
> variant B's tokens. Their contrast was measured when they were locked (see
> "Where B was changed for contrast" there), and the new `input` token answers
> P2 and P3. The rest of this audit has not been redone against B.

This is a design audit. Contrast is measured exactly from the tokens. Keyboard,
screen-reader and zoom behaviour are judged against the design and the handoff,
**not tested**, because nothing is built yet. Test all three again on the Angular
build with VoiceOver and NVDA.

## Summary

**Status after 2026-09-18:** P1 accepted as a known cost (spec §18.12). P2, P3 and O1 fixed on the canvas. R1, R2, U1, U2 and O3 specified in `handoff.md` for the build. P4 and O2 need no change.

**Issues found:** 11 | **Critical:** 1 | **Major:** 6 | **Minor:** 4

## Findings

### Perceivable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| P1 | **The Reviewer surface blocks itself under zoom.** It shows "open this on a computer" below 1024 CSS px. At 125% zoom a 1280px laptop *is* 1024 CSS px; at 150% it is 853. A low-vision Reviewer who zooms is locked out on the computer they were told to use. | 1.4.4 Resize text, 1.4.10 Reflow | 🔴 Critical | Below 1024, degrade to one stacked column (queue, then the request) instead of blocking. Keep the block only for devices that are genuinely small. **Needs the repo owner's decision** — it amends spec §16.1. |
| P2 | The **quiet button** frame (`border`, `#c8d0c9`) is 1.39:1 against the page. It is the only boundary of ย้อนกลับ, ปิดข้อความ and the code disclosure. | 1.4.11 Non-text contrast | 🟡 Major | Frame quiet buttons in `muted-foreground` (5.69:1). Still visibly quieter than secondary's ink frame. |
| P3 | In region mode the **map cells are controls**, and unselected cells (`land`) are 1.18:1 against the page. The cell edge is invisible as a boundary. | 1.4.11 Non-text contrast | 🟡 Major | Give each cell a 1px `muted-foreground` frame when the map is the control. Province mode, where the map is decoration, keeps the flat cells. |
| P4 | The leading queue row's time left is amber where the others are grey, so urgency is carried by colour. | 1.4.1 Use of colour | 🟢 Minor | Acceptable: the text states the hours and the row is first because it is oldest. No change. **Moot since 2026-10-01 (#124):** the locked queue table draws no amber leader. |

### Operable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| O1 | The **1-hour idle timeout has no warning.** Only the 6-hour ceiling has the T-5 toast, so a Reviewer reading a long dossier is signed out without notice and loses an unsaved reject note. | 2.2.1 Timing adjustable | 🟡 Major | Add a T-5 idle warning with **ยังใช้งานอยู่**. Pressing it is a user-initiated request, so under §10.5 it legitimately extends the session. The 6-hour ceiling stays unextendable; that is a security decision, recorded as such. |
| O2 | `md` buttons are about 39px tall and map cells 40px. | 2.5.5 Target size (AAA in 2.1) | 🟢 Minor | Passes the AA-level 24px of WCAG 2.2's 2.5.8. No change for AA; revisit if a phone form feels cramped in testing. |
| O3 | No page title is specified per route. | 2.4.2 Page titled | 🟢 Minor | One `<title>` per route, from the catalogue: form, check, confirmation, collection, expiry, sign in, queue. |

### Understandable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| U1 | The two date fields share **one** error message, which is not tied to either field for a screen reader. | 3.3.1 Error identification, 1.3.1 | 🟡 Major | Both inputs get `aria-invalid="true"` and `aria-describedby` pointing at the shared message. |
| U2 | Page language is unspecified. | 3.1.1 Language of page | 🟢 Minor | `<html lang="th">`. English proper names (`DDS Sharing`, `API`) are exempt from 3.1.2. |

Error prevention (3.3.4) **passes**: the check page before submit, the approve
confirmation and the reject note are exactly the confirmation steps it asks for.

### Robust

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| R1 | **Status messages are not specified**: the session warning, the refresh result, and the error summary. | 4.1.3 Status messages | 🟡 Major | Session warning `role="alert"`; refresh result `aria-live="polite"`; error summary receives focus on a failed submit. |
| R2 | A **disabled** resend or re-run carries its reason in a sentence nearby that is not tied to the button, and a `disabled` button is skipped by the keyboard, so a keyboard user never meets the reason. | 4.1.2 Name, role, value, 1.3.1 | 🟡 Major | Use `aria-disabled="true"` (stays focusable) with `aria-describedby` → *ยังทำอะไรไม่ได้จนกว่าจะดึงข้อมูลเสร็จ*. |

The design components render a `<label>` beside a text box, not a labelled
input. The Angular Field must be a native `<input>` with `<label for>`. Recorded
here rather than as a finding because it is an implementation note, not a design
fault.

## Colour contrast

Re-measured 2026-09-30 against the B tokens in `apps/web/src/styles.css` (#123).
P2 and P3 are resolved by `input`, the control-edge token.

| Element | Foreground | Background | Ratio | Required | Pass |
|---|---|---|---|---|---|
| Body text | `#1b1d24` | `#e4e6ea` | 13.47:1 | 4.5:1 | ✅ |
| Muted text on the page | `#5f6470` | `#e4e6ea` | 4.74:1 | 4.5:1 | ✅ |
| Muted text on `quiet` (consent body) | `#5f6470` | `#f7f8fa` | 5.58:1 | 4.5:1 | ✅ |
| Muted text on primary wash | `#5f6470` | `#eef1ff` | 5.27:1 | 4.5:1 | ✅ |
| Primary text on card | `#3b5bfd` | `#ffffff` | 5.12:1 | 4.5:1 | ✅ |
| **Primary on wash** (selected segment, related region) | `#3b5bfd` | `#eef1ff` | **4.55:1** | 4.5:1 | ✅ tightest text pair |
| Button text on primary | `#ffffff` | `#3b5bfd` | 5.12:1 | 4.5:1 | ✅ |
| Failed on its wash | `#c42b3a` | `#fbe9eb` | 4.78:1 | 4.5:1 | ✅ |
| Success on its wash | `#1a7a4f` | `#e6f4ec` | 4.70:1 | 4.5:1 | ✅ |
| Pending on its wash | `#8a5a00` | `#fdf3dc` | 5.37:1 | 4.5:1 | ✅ |
| Field, button and map-cell edge (`input`) on card | `#7a7e88` | `#ffffff` | 4.06:1 | 3:1 | ✅ |
| `input` on the page | `#7a7e88` | `#e4e6ea` | 3.25:1 | 3:1 | ✅ |
| Consent control edge on `quiet` | `#7a7e88` | `#f7f8fa` | 3.82:1 | 3:1 | ✅ |
| **`input` on primary wash** (consent control, ticked block) | `#7a7e88` | `#eef1ff` | **3.61:1** | 3:1 | ✅ tightest edge |
| Focus ring and selected cell (`primary`) on the page | `#3b5bfd` | `#e4e6ea` | 4.10:1 | 3:1 | ✅ |
| Meter's partial segment | `#b7791f` | `#ffffff` | 3.64:1 | 3:1 | ✅ |

## Keyboard

| Element | Tab | Enter / Space | Escape | Arrows |
|---|---|---|---|---|
| Disease group | one stop (a native select) | open | — | move between the ten, **in 1–10 order** |
| Area segmented | one stop | select | — | move between the two |
| Region map (always a control) | one stop | select | — | move between regions in number order |
| Date fields | one stop each | — | — | text inputs in พ.ศ. plus a calendar button each (`system.md`, Date field), not native date inputs |
| Check page | ส่งคำขอ, then แก้ไข | activate | — | — |
| Queue zones | one stop per row | open in the dossier; focus moves to its heading | — | — |
| Approve / reject | **only after the identity fields and the ask** in DOM order | open the dialog | — | — |
| Dialogs | trapped | confirm | close, focus returns to the trigger | — |
| Disabled resend / re-run | **focusable** (`aria-disabled`) | nothing happens | — | — |

## Screen reader

| Element | Announced as | Issue |
|---|---|---|
| Region cell | "เขตสุขภาพที่ 8, radio, selected, 8 of 13" | none if built as specified |
| Region cell 13 | "เขตสุขภาพที่ 13 กรุงเทพมหานคร" | none: it sits out of reading order and says why |
| State tag | its word, e.g. "รอพิจารณา" | none: never colour alone |
| Date range error | each field "invalid", then the shared message | none: both boxes point `aria-describedby` at it |
| Disabled resend | "ส่งอีเมลฉบับเดิมซ้ำ, dimmed, ยังทำอะไรไม่ได้…" | R2 until wired |
| Session warning | interrupts as an alert | R1 until `role="alert"` |
| Expiry page | one heading and one sentence | none |

## Priority fixes

1. **P1, the zoom lock-out.** It blocks a Reviewer outright. Needs a decision.
2. **O1, R1 and R2.** A timeout nobody is warned about, status changes nobody
   hears, and a disabled button whose reason a keyboard user never meets. These
   are spec and handoff additions, plus one new toast.
3. **P2 and P3, the two control boundaries.** Token-level fixes in two components.
4. **U1, U2 and O3.** Implementation notes for the handoff.
