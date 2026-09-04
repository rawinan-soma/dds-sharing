# 9. The visual layer: Tailwind CSS with DaisyUI, one compiled stylesheet, and Noto Sans Thai

Date: 2026-09-04

## Status

Accepted. Settles the layer `docs/spec.md` §16.4 explicitly left open, and
supplies the wireframe that is an acceptance criterion of
[#38](https://github.com/rawinan-soma/dds-sharing/issues/38).

Does not amend any earlier ADR. Constrains
[#43](https://github.com/rawinan-soma/dds-sharing/issues/43),
[#45](https://github.com/rawinan-soma/dds-sharing/issues/45),
[#47](https://github.com/rawinan-soma/dds-sharing/issues/47),
[#50](https://github.com/rawinan-soma/dds-sharing/issues/50) and
[#51](https://github.com/rawinan-soma/dds-sharing/issues/51). The toolchain
that installs it lands in [#37](https://github.com/rawinan-soma/dds-sharing/issues/37),
with the build.

**This ADR replaces an earlier text of itself.** The first version rejected
every component library and chose IBM Plex Sans Thai. Both were reversed by
maintainer direction in
[#56](https://github.com/rawinan-soma/dds-sharing/pull/56); §"What was
reversed, and why the reversal is right" below states the argument the first
version got wrong rather than quietly dropping it.

## Context

`docs/spec.md` §16.4 says it plainly:

> "This prototype settled structure, ordering and copy only. The repo owner
> supplies a wireframe during the dev cycle. Visual design, spacing, typography
> and component choice are **not** settled here."

Four UI-bearing issues sit in waves 2–5 of the dependency graph, so without this
decision two agents build two different-looking halves of one service.

Three properties of *this* service, rather than taste, decide most of it.

**The UI is Thai and only Thai** (§16.3). Not a Thai translation of an English
UI — a Thai UI, whose sentences are the only record of several decisions this
design made. Latin-tuned defaults are wrong here in a way that is invisible to
whoever ships them, and both Tailwind and DaisyUI ship Latin-tuned defaults.

**One surface can never be an Angular component.** §9.1 requires an Extract to
stay collectable even if a front-end asset fails to load, and `/d/<token>` is
served by NestJS (ADR 0003). Whatever the visual layer is, it has to be
something a NestJS-rendered page and an Angular route can *both* have.

**Two ordering rules are requirements, not styling** — §16.4's (the
de-identification block open, above the form) and §10.2's (the decision buttons
below the identity fields and the ask). A visual layer that makes either easy to
violate is the wrong one.

## Decision

### 1. Tailwind CSS v4 with DaisyUI v5. One compiled stylesheet, served to both runtimes.

`prototypes/dds-sharing-ui/src/app.css` is the source; `assets/app.css` is the
compiled artefact. The Angular build includes it as a global style; any
NestJS-rendered HTML links the same file. There is no second copy and no second
palette.

**The deciding argument is `/d/<token>`, and it is worth stating precisely,
because the first version of this ADR got it half right.**

§9.1 requires the collection path to work with the Angular bundle absent.
`/d/<token>` is served by NestJS (ADR 0003), and the page it redirects to on
failure — `/link-expired` — is therefore a page that may have to render with no
Angular at all. So the visual layer must be something two runtimes can share.

A **JS** component library cannot cross that boundary. Angular Material and
PrimeNG both ship components that need the bundle; choosing either means
`/link-expired` is a second look or a second implementation of the first.

**DaisyUI ships CSS class names and nothing else.** No JavaScript, no runtime,
no framework binding — `class="btn btn-primary"` is a selector in a stylesheet.
A NestJS template and an Angular template can carry the identical string, and
the identical stylesheet paints both. The boundary that ruled out Material is
not a boundary DaisyUI has to cross.

That is the whole argument, and it is why the reversal in #56 is correct rather
than merely a preference: the first version of this ADR wrote "component
library" where the evidence only supported "**JS** component library", and then
rejected a category on the strength of a property one member of it does not
have.

Two arguments follow behind it.

- **The theme is defined, never inherited.** DaisyUI's stock `light` theme is
  `oklch(45% 0.24 277)` primary on `oklch(100%)` — a violet nobody measured for
  this service, carrying no institutional meaning. `@plugin "daisyui" { themes:
  false; }` inherits none of them. §5 below is the theme, and every pair in it
  was computed.
- **The surface is six control types across seven screens** — text input, date
  input, select, radio group, textarea, button — plus about eleven things that
  are this service's own. DaisyUI covers the six exactly, and the eleven are
  written once, as named classes, in `@layer components`.

**Angular CDK is kept**, for `LiveAnnouncer`, `FocusTrap` and `cdkTrapFocus`.
The CDK is behaviour, not appearance; it ships no styling and no brand.

```
pnpm add -D tailwindcss @tailwindcss/postcss daisyui
pnpm add @angular/cdk
```

The prototype under `prototypes/` installs `@tailwindcss/cli` instead of the
PostCSS plugin, because it has no Angular build to hang one off. It is a
**standalone package, deliberately outside whatever pnpm workspace #37
creates** — a design artefact that must keep opening after the application's
build changes shape. #37 compiles the application's stylesheet from the same
`src/app.css`; it does not consume the prototype's committed `assets/app.css`.

**pnpm, never npm** ([#37](https://github.com/rawinan-soma/dds-sharing/issues/37)).
Do not install `@angular/material`: it depends on the CDK, but the CDK does not
depend on it, and pulling Material in for a focus trap is how a second theme
arrives anyway.

**Tailwind's `content` globs must scan the NestJS templates as well as the
Angular sources.** If they miss `/d/<token>`'s and `/link-expired`'s markup,
those pages ship unstyled — which is precisely the surface this decision was
made for. Recorded here because it is the one way to choose DaisyUI for this
reason and then lose the reason to a build config.

### 2. The governance answer to §16.3: utilities are for layout only.

§16.3's argument for keeping sentences in `messages/th.json` is that **a copy
change must be visible as a copy change.** The first version of this ADR
rejected Tailwind on exactly that ground — utility soup makes a template diff
unreadable, so a copy edit and a padding edit look alike in review. The concern
was right. It is answered rather than dropped.

**The rule, and it is checkable in review:**

> Tailwind utilities are permitted for **layout only** — `grid`, `flex`, `gap`,
> spacing, width, `max-w`. **Colour, type, and component appearance come from a
> class name**: DaisyUI's where DaisyUI has one, and this service's where it
> does not.

So a button is `class="btn btn-primary"`, never a forty-token class attribute.
A diff that changes a sentence shows one changed string. A diff that adds
`text-sm`, `text-[#0a5468]` or `bg-teal-800` to a template is wrong on sight,
and does not need a style discussion to reject.

**DaisyUI is what makes the rule affordable.** Without it, the rule would mean
hand-writing every control, which is what the first version of this ADR
concluded. With it, the semantic class already exists and is published, so
following the rule is the path of least effort rather than a discipline someone
has to keep.

**The eleven classes this service adds** are each named after a term that is
already in `CONTEXT.md`: `.shell`, `.masthead`, `.panel`, `.notice-gate`,
`.notice`, `.field`, `.kv`, `.refnum`, `.code-grid`, `.queue-item`,
`.decision`, plus `.banner`, `.split`, `.help` and `.skip-link`. Each maps 1:1
onto an Angular component.

### 3. Typography: Noto Sans Thai, loopless, self-hosted, with Noto Sans Mono.

This is the decision that mattered most, and it is not cosmetic.

- **Loopless (ไม่มีหัว), not looped.** The family Google publishes as *Noto Sans
  Thai* is the loopless cut; *Noto Sans Thai Looped* is the other one and is
  ruled out. Looped Thai reads in Thailand as primary-school material, and this
  screen carries a legal undertaking about personal data. Unchanged from the
  first version of this ADR, which said the same thing about a different family.
- **Noto Sans Thai carries the Latin too, and the pairing is measured, not
  assumed.** §16.3 says "English is in the file, never on the screen", and it is
  *almost* true — the Requester page lists the Extract's 23 column names
  (`epidem_chw_code`, `onset_age`), reference numbers are `REQ-2569-0144`, and
  the review screen shows Report codes. Thai, Latin and monospace therefore
  share every screen. The first version of this ADR rejected Noto on the grounds
  that its Thai has "no matching mono" and that Plex was the only trio drawn as
  one family. Both claims were checked against the actual font binaries this
  design ships:

  | Measured | Noto Sans Thai (latin) | Noto Sans (latin) | Noto Sans Mono |
  |---|---|---|---|
  | Units per em | 1000 | 1000 | 1000 |
  | Cap height | 714 | 714 | **714** |
  | x-height | 556 | 536 | 536 |
  | Identical advance widths | — | **211 of 212 common glyphs (99%)** | — |

  So: **Noto Sans Thai's Latin *is* Noto Sans's Latin**, to the advance width,
  with the x-height raised 20/1000 em so it sits with the Thai rather than under
  it. And **Noto Sans Mono's cap height is identical to the UI face's**, which
  is the property that makes `REQ-2569-0144` line up beside Thai instead of
  floating. The "no matching mono" objection does not survive the numbers.

  The practical consequence: the trio is **two files' worth of families**, not
  three. Noto Sans stays named in the stack as a fallback; it is not shipped
  twice.
- **Sarabun stays third in the stack.** It is the Thai government convention and
  is already installed on most ministry machines, so it is the right fallback
  rather than the wrong first choice.
- **Self-hosted woff2, `thai` + `latin` + `latin-ext` for the UI face and
  `latin` for the mono. 103 KB total. No Google Fonts link.** §15.3 rejected an
  external dead-man's-switch on the grounds of an outbound internet dependency
  on a ministry host; a font CDN is the same dependency, on the critical path of
  first paint, on the connection §16.2 already assumes is bad enough to need
  range requests.

  All three faces are **variable** on `wght` 100–900, so one file per subset
  covers 400/500/600/700. That is 103 KB for four weights of two families,
  against 176 KB for the twenty static files the first version of this ADR
  committed.

**Thai metrics, and each of these is load-bearing:**

| Rule | Why |
|---|---|
| Body line-height **1.75**; running prose **1.8**; **nothing below 1.55, anywhere** | Thai stacks four levels — below-vowel, base, above-vowel, tone mark. See §4: the floor is arithmetic, not taste. |
| **`letter-spacing: 0` everywhere.** Never track Thai. | Thai renders as clusters and has no word spaces, so tracking reads as word breaks in a script that has none. |
| **Never `text-align: justify`.** | With no spaces to stretch, justification stretches glyphs. |
| **`hyphens: none`, `word-break: normal`.** | Thai line breaking is dictionary-based; both hyphenation and CJK-style breaking cut inside a cluster. |
| Minimum body size **16 px**; hard floor **13 px**, metadata only | Tone marks are the first thing to disappear. |
| **No `text-transform: uppercase`** | Meaningless in Thai, and it silently shouts at the Latin column names beside it. |
| Prose measure **62ch**, not the usual 75 | With no word spaces, re-finding your place on a long Thai line is harder. |
| Emails: `mso-line-height-rule: exactly` with the height in px | Without it Word computes its own leading and clips Thai tone marks. Invisible to anyone testing in Gmail. |

### 4. What Tailwind preflight and DaisyUI get wrong for Thai, and the arithmetic that says so.

This section exists because the defaults are wrong in a way that produces no
error, no warning and no obviously broken screenshot — the tone mark simply is
not there, and only a Thai reader notices.

**The number everything turns on.** Noto Sans Thai declares `hhea` ascent
**1061** and descent **−450** on a 1000-unit em. Its own glyph box is therefore
**1.511 em**. A line-height below 1.511 is a line box shorter than the font it
is asked to hold: the lines overlap, and what lands in the overlap is the tone
mark of the line below meeting the descender of the line above. Thai has no word
spaces, so Thai wraps mid-phrase and multi-line text is the normal case, not the
edge case.

**Tailwind preflight sets `html { line-height: 1.5 }`.** That is 0.011 em short
of the font's own box, on every element on every page, before any component is
involved. Overridden to **1.75**.

**Every line-height Tailwind ships with its type scale is under the floor:**

| Tailwind default | Ratio | This theme |
|---|---|---|
| `--text-xs--line-height` | 1.333 | 1.6 |
| `--text-sm--line-height` | 1.429 | 1.65 |
| `--text-base--line-height` | 1.5 | 1.75 |
| `--text-lg--line-height` | 1.556 | 1.6 |
| `--text-xl--line-height` | 1.4 | 1.55 |
| `--text-2xl--line-height` | 1.333 | 1.55 |
| `leading-tight` / `leading-snug` | 1.25 / 1.375 | both reassigned to 1.55 |

`leading-tight` and `leading-snug` are **reassigned rather than left alone**,
because leaving them is leaving two utilities named as though they were safe.

> **This corrects the first version of this ADR**, which set headings ≥ 1.25rem
> to **1.35**. At 1.35 a single-line heading looks fine and a wrapped one
> collides — and Thai headings wrap. Everything is now ≥ 1.55. This is a
> tightening of the surviving 1.75 rule, not a re-opening of it.

**DaisyUI's own component metrics, each overridden explicitly:**

| DaisyUI ships | Consequence for Thai | Override |
|---|---|---|
| `.btn { font-size: .875rem }` (14 px) | Body is 16 px; a button two steps smaller is how the 13 px floor gets crossed by nobody's decision | `var(--text-base)` |
| `.btn { text-shadow: 0 .5px … × --depth }` | A half-pixel shadow under a tone mark smears the mark it sits below | `--depth: 0`, plus `text-shadow: none` |
| `.input { font-size: max(--font-size, .875rem) }` | The value in a field renders smaller than its own label | `--font-size-min: var(--text-base)` |
| `.alert { font-size:.875rem; line-height:1.25rem }` | Ratio **1.4286** — 0.082 em under the glyph box, stated in **absolute px**, so no font-size change alone can fix it | explicit `1.75` |
| `.badge { height: --size-selector × 6 }` = 24 px | 14 px Thai needs 21.2 px of glyph box plus padding; the tone mark is what is cut | `--size-selector: .3125rem` (30 px) and `height: auto` so long Thai state names wrap |
| `.footer-title { text-transform: uppercase }` | Meaningless in Thai | `text-transform: none` |
| `.otp { letter-spacing: … }` | Correct for digits, wrong for Thai | scoped to `.input-otp` only |
| `--size-field: .25rem` → 40 px controls | Under the 44 px target in §6 | `.275rem` → 44 px |
| `--depth: 1` | Inset highlights and a drop shadow on every button | `0` — **a record does not float** |

**These overrides are written unlayered, as one block at the bottom of
`src/app.css`.** DaisyUI emits its components inside
`@layer utilities { @layer daisyui.l1.l2.l3 { … } }`, which outranks anything in
`@layer components`; unlayered declarations outrank every layer. Keeping them as
one block is also the point: a reviewer sees the entire list of what DaisyUI
ships that Thai cannot use, in one screen, instead of hunting it per component.

**`prototypes/dds-sharing-ui/scripts/check-metrics.py` asserts every claim in
this section against the compiled stylesheet.** It is 28 assertions, plus the
line-height floor, plus two rules about colour: that none may be declared
outside the theme, and that **every `--color-*` a rule references is actually
declared and does not define itself**. A Tailwind or DaisyUI upgrade that
quietly reintroduces a Latin metric fails it rather than shipping clipped tone
marks.

It has already caught two bugs in this design, and the second is the reason the
second colour rule exists: a rename rewrote five `--color-*-tint` declarations
into references to themselves, so four notice blocks lost their backgrounds
**with no error, no warning, and no missing selector** — the background was
simply not painted. That is the same failure mode as the tone marks, in a
different medium, and it is why this file asserts rather than describes.

### 5. Colour: the theme is defined, and every pair was computed on the ground it lands on.

One institutional accent, and semantic colour reserved for the states this
service actually has. Deep teal-blue for every action; approve, reject and
scheduler-stopped each have one hue. Nothing else is coloured.

**The DaisyUI theme `dds`:**

| DaisyUI slot | Value | Measured |
|---|---|---|
| `--color-base-100` | `#FFFFFF` | panel |
| `--color-base-200` | `#F2F4F6` | page |
| `--color-base-300` | `#EAEEF1` | sunken |
| `--color-base-content` | `#12181F` | 17.85 white · 16.19 page · 15.86 Reviewer |
| `--color-primary` | `#0A5468` | 8.46 on white · white on it 8.46 |
| `--color-secondary` | `#06333F` | the approval-gate ground · white on it **13.52** |
| `--color-accent` | `#0D6A83` | white on it 6.16 |
| `--color-neutral` | `#2B333D` | white on it 12.78 |
| `--color-success` | `#14603C` | 7.59 on white · **6.73 on its own tint** |
| `--color-error` | `#9B1C22` | 8.13 on white · **7.08 on its own tint** |
| `--color-warning` | `#7A4A00` | 7.48 on white · **6.85 on its own tint** |
| `--color-info` | `#0A5468` | **7.37 on its own tint** |

**Three neutrals DaisyUI has no slot for**, registered in `@theme` so they are
names rather than literals:

| Token | Value | Measured |
|---|---|---|
| `--color-muted` | `#5E6975` | 5.59 white · 5.07 page · **4.97 Reviewer** · 4.80 base-300 |
| `--color-line` | `#78828E` | 3.90 white · 3.54 page · **3.47 Reviewer** · 3.34 base-300 — 3:1 non-text on all four |
| `--color-hairline` | `#DDE2E7` | 1.30 — decorative only, never a control border, never text |

> **`--color-muted` is a correction, and it is the reason this ADR says "on the
> ground it lands on".** The first version specified `#64707C` and recorded
> "5.1:1", which is true — on white. On the tinted Reviewer ground it is
> **4.49:1**, failing 4.5:1 by a hundredth, and nothing in that version measured
> it there. `#5E6975` clears every surface this service paints.

**One rule keeps this honest, and the check script enforces it:** every colour is
declared once, in the theme block, with its measured ratio beside it. **No hex
literal appears below `@theme` in `src/app.css`.** A colour written inside a
component is a colour nobody measured on the ground it lands on — which is
exactly how `#64707C` shipped at 4.49:1 the first time.

**Two colour moves worth naming:**

- **The approval-gate notice is the only filled dark ground in the system**
  (`--color-secondary`, `#06333F`). It is the one block that must not be skimmed
  past, and it says *"นี่ไม่ใช่ปุ่มดาวน์โหลด"*.
- **The Reviewer surface is a second DaisyUI theme, not a second palette.**
  `data-theme="dds-reviewer"` flips `base-200` to `#EEF2F5` and changes nothing
  else. A Reviewer's name goes permanently onto whatever they press; which side
  of the approval gate you are on should not need reading to establish.

### 6. The scales.

**Spacing — Tailwind's own 4 px base, unchanged.** The scale ADR 0009 set in its
first version *is* Tailwind's scale, so `p-1 … p-16` are the tokens and there is
nothing to override. Density 6/10: a government form is a document, not a
dashboard, but it is also not a marketing page.

Component-level: **44 px** every input and every button (`--size-field:
.275rem`), 36 px secondary, 24 px panel padding, 20 px field gap. Radii 4 / 4 /
8 px (`--radius-selector` / `--radius-field` / `--radius-box`). **No elevation
ramp at all** — `--depth: 0`, and the two shadows in `@theme` are near-invisible.
A record does not float.

**Type — 1.125 ratio, base 16 px, deliberately flat.** A steep ramp is a
landing-page device; here the largest thing on any screen is a reference number
someone reads down a telephone. Tailwind's scale steps are **redefined**, not
supplemented, so `text-sm` means this service's 15 px and not Tailwind's 14 px:

| Token | Size | Line-height | Used for |
|---|---|---|---|
| `--text-2xs` | 13 px | 1.55 | **the floor.** Metadata only — never a sentence |
| `--text-xs` | 14 px | 1.6 | help text, chips, table meta |
| `--text-sm` | 15 px | 1.65 | labels, buttons |
| `--text-base` | 16 px | 1.75 | **body** |
| `--text-md` | 17 px | 1.8 | long Thai prose |
| `--text-lg` | 19 px | 1.6 | h3 |
| `--text-xl` | 22 px | 1.55 | h2 |
| `--text-2xl` | 26 px | 1.55 | h1, reference number |
| `--text-3xl` | 32 px | 1.55 | unused today; reserved |

Weights 400 / 500 / 600 / 700 — no 300, which disappears in Thai at body size.
Measure `--container-prose` **62ch**, not the usual 75.

### 7. Accessibility target: WCAG 2.2 level AA. No policy existed; this is it.

- Every text pair verified ≥ 4.5:1 **on every surface it appears on**, not on
  white only; most clear 7:1. Control borders use `--color-line`, which holds
  3:1 non-text on all four grounds — which is why that value and not a lighter
  grey.
- One focus treatment everywhere: 2 px outline, 2 px offset, with a white inner
  ring on filled buttons so the indicator clears 3:1 against the fill *and*
  against the page. `:focus:not(:focus-visible) { outline: none }` is written
  explicitly, as the thing a later change would have to delete on purpose.
- **Every control is 44 px tall**, not the 24 px AA floor. The two buttons that
  matter are irreversible and one puts a person's name on a data release, so the
  whole set is sized for the worst one. Radio labels carry `min-height: 2.75rem`
  because DaisyUI sizes the dot, not the hit area.
- Colour never carries meaning alone: every state chip names the state in words,
  and the derived-column marker in `.code-grid` carries a glyph as well as a hue.
- Errors are inline, `aria-describedby`-linked, `role="alert"`, with a focusable
  error summary at the top of the form. A summary never replaces the inline error.
- `prefers-reduced-motion` honoured. Motion is near-absent anyway.

### 8. Responsive: the ministry laptop is the design target, not the phone.

Mobile-first CSS, but sized for 1366×768. The Reviewer split queue collapses to
one column below 1024 px. `/` and `/link-expired` work at any width because they
are public and someone will open them on a phone.

### 9. Two shapes the ordering rules dictate.

- **The Requester page contains no `<details>` element**, anywhere. §16.4
  requires the de-identification block open and visible without interaction; a
  collapsible is how that requirement gets lost during a "tidy up".
- **The decision block is the last element in the document, and is neither
  sticky nor a fixed footer bar.** A sticky action bar would put approve back on
  screen without the scroll, which is precisely what §10.2 forbids. `.decision`
  writes `position: static` explicitly, so undoing it is a visible edit to a
  file this ADR names rather than a utility somebody adds to a template — and
  the check script asserts it.

### 10. The four email templates are out of scope for this stack, and did not change.

Outlook renders through the Word engine, which supports neither an external
stylesheet nor a class selector it can rely on. A Tailwind utility and a DaisyUI
component class are equally invisible to it. The emails are tables with inline
styles, the theme's colours transcribed as literal hex, and
`mso-line-height-rule: exactly` on every text cell.

The consequence worth holding on to: **the emails did not change when the stack
changed.** They were written against Outlook, not against a CSS framework. Their
only edit in this revision is one colour — `#64707c` to `#5e6975` — because that
token was corrected for contrast and this service keeps one palette, not two.
Reasoning in `prototypes/dds-sharing-ui/emails/_shared-notes.md`.

## What was reversed, and why the reversal is right

Recorded so the argument is not re-run from scratch a third time.

| First version said | Why it was wrong | Now |
|---|---|---|
| "No component library — components cannot cross the Angular/NestJS boundary" | True of **JS** component libraries. DaisyUI ships CSS classes, which cross it fine. The ADR rejected a category on a property one member does not have. | DaisyUI, chosen *because* of that boundary |
| "Tailwind is rejected: utility soup makes a copy diff unreadable" | The concern is real and is §16.3's. It is a governance problem with an answer, not a reason to reject the tool. | Tailwind, with the layout-only rule in §2 — and DaisyUI is what makes that rule the cheap path |
| "IBM Plex Sans Thai — Noto Sans Thai has no matching mono" | Not true of the binaries. Noto Sans Mono's cap height is identical (714/1000) to Noto Sans Thai's, and Noto Sans Thai's Latin is Noto Sans's Latin to the advance width. | Noto Sans Thai + Noto Sans Mono, measured in §3 |
| Headings ≥ 1.25rem at line-height **1.35** | Below the font's own 1.511 em glyph box. Fine on one line, collides on wrap, and Thai wraps. | ≥ 1.55 everywhere |
| `--text-tertiary: #64707C`, "5.1:1" | Measured on white only. 4.49:1 on the tinted Reviewer ground — a fail. | `--color-muted: #5E6975`, measured on all four grounds |

**What survives untouched**, and is not re-litigated here: the Thai metrics
table, loopless not looped, self-hosted woff2 with no CDN, WCAG 2.2 AA measured
rather than assumed, 44 px controls, the no-`<details>` rule, the
neither-sticky-nor-fixed decision block, and the four email templates.

## Consequences

- **#43, #45, #47, #51 build against `prototypes/dds-sharing-ui/`** — its markup,
  its class names, its theme. Each class maps to one Angular component.
- **#37 owns installing the toolchain**, including the `content` globs that must
  reach the NestJS templates. Getting those globs wrong ships `/link-expired`
  unstyled, which is the exact surface this ADR chose DaisyUI for.
- **The font files are in git** (103 KB). Accepted deliberately: reproducible
  builds, no CDN on a ministry host, no first-paint dependency on the internet.
- **The compiled `assets/app.css` is committed** alongside its source, so the
  prototype opens by double-clicking `index.html` with no install step. The
  application does not consume the committed file; #37 compiles its own from
  `src/app.css`.
- ⚠️ **70 new message keys are needed and they are proposals, not decisions.**
  `prototypes/dds-sharing-ui/messages/th.proposed.json`. §16.3 makes copy
  normative and appearance not, so this design **must not** land them into
  `messages/th.json` on its own authority. The repo owner accepts, rewrites or
  rejects each. Sixty-eight are unchanged from the first version — the stack
  reversal changed no sentence. **The two new ones are page titles**: a
  `<title>` is copy, because it is what a person sees in a tab and keeps in a
  bookmark, and neither version of this design had keyed it.
- **The prototype is Thai where it is the product and English where it is
  documentation.** The seven screens are Thai (§16.3). `index.html` and
  `surfaces/07-download.html` are English: the first is a contact sheet, the
  second documents a route that renders no page. Both follow the repo's
  documentation convention (`docs/srs.md` §6.1). This is not tidiness —
  unkeyed Thai prose in a prototype is Thai prose *a design session wrote*, and
  §16.3 says a design session does not get to write the product's Thai.
- ⚠️ **Three groups of keys already on `main` contradict the settled spec** and
  are used nowhere in this design. Listed in the prototype README.
  `rev_drain_label` and `rev_drain_note` are a projected runtime estimate, which
  §10.2 says the review screen must not show; `rev_expand_identity` and
  `rev_approve_locked` are from a rejected prototype variant; the six `group_*`
  keys are the old six-group D506 set, superseded by the ten in
  `docs/disease-groups.md`.

## The one open question this design cannot settle by itself

**`/link-expired` has two spec sections pointing opposite ways.** Recorded on
[#51](https://github.com/rawinan-soma/dds-sharing/issues/51).

§16.2 lists it as an Angular route. §9.1 requires the collection path to survive
the Angular bundle failing to load — and `/link-expired` *is* where `/d/<token>`
sends a Requester whose token is dead. If the bundle fails, the page is blank at
exactly the moment someone is trying to find out why their download stopped
working.

§16.1's rejection of prerendering does not obviously cover this page: it
rejected prerendering **a form** ("a prerendered form is a picture of a form
until the bundle hydrates"), and `/link-expired` has one sentence, one telephone
number, and no interaction at all.

**This design does not resolve it, because it is a serving decision and not a
visual one.** What it does instead: `/link-expired` uses no Angular component,
no JavaScript, and nothing but the one compiled stylesheet both runtimes already
serve — so it renders identically whichever way the repo owner resolves it.
Which is, again, the property that chose this stack.
