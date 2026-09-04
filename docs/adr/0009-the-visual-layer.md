# 9. The visual layer: no component library, a shared token file, and IBM Plex Sans Thai

Date: 2026-09-04

## Status

Accepted. Settles the layer spec §16.4 explicitly left open, and supplies the
wireframe that is an acceptance criterion of
[#38](https://github.com/rawinan-soma/dds-sharing/issues/38).

Does not amend any earlier ADR. Constrains [#43](https://github.com/rawinan-soma/dds-sharing/issues/43),
[#45](https://github.com/rawinan-soma/dds-sharing/issues/45),
[#47](https://github.com/rawinan-soma/dds-sharing/issues/47),
[#50](https://github.com/rawinan-soma/dds-sharing/issues/50) and
[#51](https://github.com/rawinan-soma/dds-sharing/issues/51).

## Context

`docs/spec.md` §16.4 says it plainly:

> "This prototype settled structure, ordering and copy only. The repo owner
> supplies a wireframe during the dev cycle. Visual design, spacing, typography
> and component choice are **not** settled here."

Verified absent from the spec, all eight prior ADRs and `CONTEXT.md`: any mention
of Tailwind, Angular Material, PrimeNG, Bootstrap, SCSS, or a font. Four
UI-bearing issues sit in waves 2–5 of the dependency graph, so without this
decision two agents build two different-looking halves of one service.

Three properties of *this* service, rather than taste, decide most of it.

**The UI is Thai and only Thai** (§16.3). Not a Thai translation of an English
UI — a Thai UI, whose sentences are the only record of several decisions this
design made. Latin-tuned defaults are wrong here in a way that is invisible to
whoever ships them.

**One surface can never be an Angular component.** §9.1 requires an Extract to
stay collectable even if a front-end asset fails to load, and `/d/<token>` is
served by NestJS (ADR 0003). Whatever the visual layer is, it has to be
something a NestJS-rendered page and an Angular route can *both* have.

**Two ordering rules are requirements, not styling** — §16.4's (the
de-identification block open, above the form) and §10.2's (the decision buttons
below the identity fields and the ask). A visual layer that makes either easy to
violate is the wrong one.

## Decision

### 1. No component library. Plain CSS custom properties, three token layers.

Angular Material, PrimeNG and Bootstrap are all rejected, and hand-rolled
components are built against a token file: `primitive → semantic → component`,
in `prototypes/dds-sharing-ui/assets/tokens.css`.

The deciding argument is the one above: **a token file is the only visual layer
the SPA and a NestJS-rendered page can share.** Components cannot cross that
boundary; a stylesheet can. Choose a component library and `/link-expired` is
either a second look or a second implementation of the first.

Three arguments follow behind it.

- **Material Design is a brand, and it is not this one.** MD3 reads as Google.
  This screen carries a ministry's undertaking about personal data.
- **Material's typography config is Latin-tuned** and fights every decision in
  §3 below. Overriding a library's type ramp per-component is more work than
  writing six controls.
- **The surface is six control types across seven screens** — text input, date
  input, select, radio group, textarea, button. That is not a component-library
  problem.

**Angular CDK is kept**, for `LiveAnnouncer`, `FocusTrap` and `cdkTrapFocus`.
The CDK is behaviour, not appearance; it ships no styling and no brand.

**Tailwind is rejected for a reason specific to §16.3.** Its whole governance
argument is that a copy change must be visible *as a copy change*, which is why
sentences live in `messages/th.json` and not in templates. Utility soup makes a
template diff unreadable, so a copy change and a padding change look alike in
review. Four layout primitives (`.stack`, `.row`, `.spread`, `.grid-2`) cover
this application.

### 2. The stylesheet is one artefact, included by both runtimes.

`tokens.css` + `base.css` + `components.css`. The Angular build includes them as
global styles; any NestJS-rendered HTML includes the same files. There is no
second copy and no second palette.

The one exception is the four email templates, where the tokens are transcribed
as **literal hex inline**, because Outlook's Word rendering engine supports
neither custom properties nor a `<style>` block. That exception is written down
in `prototypes/dds-sharing-ui/emails/_shared-notes.md` so it is not read as
drift.

### 3. Typography: IBM Plex Sans Thai and IBM Plex Mono, self-hosted, loopless.

This is the decision that mattered most, and it is not cosmetic.

- **Loopless (ไม่มีหัว), not looped.** Looped Thai reads in Thailand as
  primary-school material. This screen carries a legal undertaking about
  personal data. That rules out IBM Plex Sans Thai **Looped** and Noto Sans Thai
  Looped.
- **IBM Plex Sans Thai over Sarabun and Noto Sans Thai**, on one argument the
  other two lose: **English is unavoidably on this screen.** §16.3 says "English
  is in the file, never on the screen", and it is *almost* true — but the
  Requester page lists the Extract's 23 column names (`epidem_chw_code`,
  `onset_age`), reference numbers are `REQ-2569-0144`, and the review screen
  shows Report codes. Thai, Latin and monospace therefore share every screen,
  and Plex is the only candidate whose Thai, Latin and mono were drawn as one
  family. Sarabun's Latin is an afterthought; Noto Sans Thai has no matching
  mono.
- **Sarabun stays second in the stack.** It is the Thai government convention
  and is already installed on most ministry machines, so it is the right
  fallback rather than the wrong first choice.
- **Self-hosted woff2, `thai` + `latin` subsets only, 176 KB total.** No Google
  Fonts link. §15.3 rejected an external dead-man's-switch on the grounds of an
  outbound internet dependency on a ministry host; a font CDN is the same
  dependency, on the critical path of first paint, on the connection §16.2
  already assumes is bad enough to need range requests.

**Thai metrics, and each of these is load-bearing:**

| Rule | Why |
|---|---|
| Body line-height **1.75**; running prose **1.8** | Thai stacks four levels — below-vowel, base, above-vowel, tone mark. Latin's 1.5 clips tone marks against the line above. |
| **`letter-spacing: 0` everywhere.** Never track Thai. | Thai renders as clusters and has no word spaces, so tracking reads as word breaks in a script that has none. |
| **Never `text-align: justify`.** | With no spaces to stretch, justification stretches glyphs. |
| Minimum body size **16 px**; hard floor **13 px**, metadata only | Tone marks are the first thing to disappear. |
| **No `text-transform: uppercase`** | Meaningless in Thai, and it silently shouts at the Latin column names beside it. |
| Prose measure **62ch**, not the usual 75 | With no word spaces, re-finding your place on a long Thai line is harder. |
| Emails: `mso-line-height-rule: exactly` with the height in px | Without it Word computes its own leading and clips Thai tone marks. Invisible to anyone testing in Gmail. |

### 4. Colour: one institutional accent, and semantic colour reserved for the four states this service actually has.

Deep teal-blue `#0A5468` for every action. `#14603C` approve, `#9B1C22` reject,
`#7A4A00` scheduler-stopped. Nothing else is coloured.

Two moves worth naming:

- **The approval-gate notice is the only filled dark ground in the system**
  (`#06333F`). It is the one block that must not be skimmed past, and it says
  *"นี่ไม่ใช่ปุ่มดาวน์โหลด"*.
- **The Reviewer surface is tinted a half-step cooler than the Requester's**,
  by one token flip (`.surface-reviewer`), not a second palette. A Reviewer's
  name goes permanently onto whatever they press; which side of the approval
  gate you are on should not need reading to establish.

### 5. Accessibility target: WCAG 2.2 level AA. No policy existed; this is it.

- Every text pair verified ≥ 4.5:1; most clear 7:1. Control borders use
  `#78828E`, 3.9:1 on white and 3.5:1 on the tinted Reviewer ground — the 3:1
  non-text minimum holds on **both** surfaces, which is why that value and not a
  lighter grey.
- One focus treatment everywhere: 2 px outline, 2 px offset, with a white inner
  ring on filled buttons so the indicator clears 3:1 against the fill *and*
  against the page.
- **Every control is 44 px tall**, not the 24 px AA floor. The two buttons that
  matter are irreversible and one puts a person's name on a data release, so the
  whole set is sized for the worst one.
- Colour never carries meaning alone: every state chip names the state in words.
- Errors are inline, `aria-describedby`-linked, `role="alert"`, with a focusable
  error summary at the top of the form.
- `prefers-reduced-motion` honoured. Motion is near-absent anyway: shadows are
  minimal and there are no entrance animations. A record does not float.

### 6. Responsive: the ministry laptop is the design target, not the phone.

Mobile-first CSS, but sized for 1366×768. The Reviewer split queue collapses to
one column below 1024 px. `/` and `/link-expired` work at any width because they
are public and someone will open them on a phone.

### 7. Two shapes the ordering rules dictate.

- **The Requester page contains no `<details>` element**, anywhere. §16.4
  requires the de-identification block open and visible without interaction; a
  collapsible is how that requirement gets lost during a "tidy up".
- **The decision block is the last element in the document, and is neither
  sticky nor a fixed footer bar.** A sticky action bar would put approve back on
  screen without the scroll, which is precisely what §10.2 forbids. Recorded
  here because a sticky bar is the obvious "improvement" someone will propose.

## Consequences

- **#43, #45, #47, #51 build against `prototypes/dds-sharing-ui/`** — its
  markup, its class names, its tokens. Each class maps to one Angular component.
- **Six controls must be written by hand.** Accepted: it is less work than
  overriding a library's Thai metrics, and it is the only way `/link-expired`
  can look like the rest of the service.
- **The font files are in git** (176 KB). Accepted deliberately: reproducible
  builds, no CDN on a ministry host, no first-paint dependency on the internet.
- ⚠️ **68 new message keys are needed and they are proposals, not decisions.**
  `prototypes/dds-sharing-ui/messages/th.proposed.json`. §16.3 makes copy
  normative and appearance not, so this design **must not** land them into
  `messages/th.json` on its own authority. The repo owner accepts, rewrites or
  rejects each. See the table in the prototype README.
- ⚠️ **Three keys already on `main` contradict the settled spec and are used
  nowhere in this design.** Listed in the prototype README. `rev_drain_label`
  and `rev_drain_note` are a projected runtime estimate, which §10.2 says the
  review screen must not show; `rev_approve_locked` is from a rejected
  prototype variant. They are stale copy from #11, not decisions.

## The one open question this design cannot settle by itself

**`/link-expired` has two spec sections pointing opposite ways.**

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
visual one.** What it does instead: `/link-expired` is built from nothing but
the shared stylesheet and uses no Angular component, so it renders identically
whichever way the repo owner resolves it. Flagged in
[#38](https://github.com/rawinan-soma/dds-sharing/issues/38) and worth a decision
before [#51](https://github.com/rawinan-soma/dds-sharing/issues/51) starts.
