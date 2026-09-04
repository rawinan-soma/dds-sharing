# DDS Sharing — the visual design

**Tailwind CSS v4 + DaisyUI v5 + Noto Sans Thai.** Open `index.html` in a
browser — it is a contact sheet linking every surface. `assets/app.css` is
committed compiled, so viewing needs no install.

Settled by [ADR 0009](../../docs/adr/0009-the-visual-layer.md). Supplies the
wireframe that is an acceptance criterion of
[#38](https://github.com/rawinan-soma/dds-sharing/issues/38), which gates
[#55](https://github.com/rawinan-soma/dds-sharing/issues/55). The toolchain that
installs this into the application is
[#37](https://github.com/rawinan-soma/dds-sharing/issues/37), not this
directory.

```
index.html            contact sheet — start here
src/app.css           THE SOURCE. Theme, scales, Thai overrides, components.
assets/app.css        compiled, committed, so index.html opens by double-click
assets/fonts/         Noto Sans Thai + Noto Sans Mono, variable woff2, 103 KB
scripts/check-metrics.py   asserts ADR 0009's claims against the built CSS
surfaces/             the seven routes + the password-change form
emails/               the four Thai emails, plus _shared-notes.md on Outlook
messages/
  th.proposed.json    68 NEW strings — proposals, not decisions. See below.
```

## Building

```bash
pnpm install
pnpm build          # src/app.css → assets/app.css
pnpm dev            # the same, watching
python3 scripts/check-metrics.py
```

**pnpm, never npm** ([#37](https://github.com/rawinan-soma/dds-sharing/issues/37)).

This is a **standalone package, deliberately outside whatever pnpm workspace #37
creates**. A design artefact has to keep opening after the application's build
changes shape, so it owns its own lockfile and installs `@tailwindcss/cli`
rather than the PostCSS plugin — it has no Angular build to hang one off. #37
compiles the application's stylesheet from this same `src/app.css`; it does not
consume the `assets/app.css` committed here.

`check-metrics.py` is the interesting one. It asserts 28 things ADR 0009 states
in prose — that the theme is defined and not inherited, that every DaisyUI Latin
metric is overridden, that no line-height sits under Noto Sans Thai's own
1.511 em glyph box, that no Google Fonts URL is on the critical path, and that
**no colour is declared outside the theme block**. A Tailwind or DaisyUI upgrade
that quietly restores a Latin default fails it rather than shipping clipped tone
marks.

## What is normative here, and what is not

**Normative, carried from the spec and the #11 prototype:** structure, ordering,
and the Thai copy that already exists in `messages/th.json`.

**This design's own contribution, and what ADR 0009 records:** the CSS approach,
the DaisyUI theme, the typeface, the scales, the accessibility target, and the
responsive behaviour.

**Not normative:** the fake data. Names, reference numbers, row counts and dates
are invented. `REPLACE-WITH-FRONTEND-URL` in the emails is a placeholder for
`FRONTEND_URL`, which §16.2 requires be explicit configuration and never derived
from the `Host` header.

## How an implementer uses this

**Every text node carries `data-i18n="key"`** naming the `messages/th.json` key
that feeds it. That is the mapping from this markup to a Paraglide call — the
attribute exists so nobody has to guess, and so no Thai sentence gets inlined
into an Angular template (§16.3). 144 keys are used across the eight surfaces:
76 from `main`, 68 proposed.

**Class discipline — this is the rule ADR 0009 §2 exists to keep:**

> Tailwind utilities are for **layout only** — `grid`, `flex`, `gap`, spacing,
> width. **Colour, type and component appearance come from a class name**:
> DaisyUI's where DaisyUI has one, this service's where it does not.

So a button is `class="btn btn-primary"`. A diff that adds `text-sm`,
`bg-teal-800` or `text-[#0a5468]` to a template is wrong on sight. This is
§16.3's argument applied to styling: a copy change must read as a copy change,
which it cannot if the sentence is buried in a forty-token class attribute.

Fifteen classes are this service's own, each named after a term already in
`CONTEXT.md`: `.shell`, `.masthead`, `.panel`, `.notice-gate`, `.notice`,
`.help`, `.field`, `.radio-set`, `.kv`, `.refnum`, `.code-grid`, `.queue-item`,
`.decision`, `.banner`, `.split`, `.skip-link`. Each maps 1:1 onto an Angular
component.

**Two themes, one palette.** `data-theme="dds"` is the Requester side;
`data-theme="dds-reviewer"` flips one surface colour and nothing else.

## The six requirements this design is shaped by

These are not style choices, and a review should check them first.

1. **§16.4 — one scrolling page**, in order: approval-gate notice →
   de-identification block → parameters → contact fields → submit. Not a wizard,
   not a two-column live preview.
2. **§16.4 — the de-identification block is open, above the form.** There is no
   `<details>` element on the Requester page. Deliberately.
3. **§10.2 — the decision buttons sit BELOW the identity fields and the ask.**
   The decision block is the last element in the document and is neither sticky
   nor a fixed footer bar; `.decision` writes `position: static` on purpose, and
   `check-metrics.py` asserts it.
4. **§10.5 — the queue never auto-refreshes.** The design's answer is an
   explicit refresh control with an "as of" time beside it, so the screen states
   its own staleness rather than hiding it.
5. **§9.4 — one identical expiry page** for all four failure states. No
   reference number, no prefill, no resubmit link, no "try again".
6. **§10.6 — an Alert is cleared only by naming an outcome from a closed set.**
   Radio buttons, never a text box.

## Why DaisyUI and not Angular Material — the short version

`/d/<token>` is served by NestJS, not Angular (ADR 0003), and §9.1 requires
collection to work with the Angular bundle absent. The page it redirects to on
failure, `/link-expired`, may therefore have to render with no Angular at all.

A **JS** component library cannot cross that boundary. **DaisyUI ships CSS class
names and nothing else** — `class="btn btn-primary"` is a selector in a
stylesheet, so a NestJS template and an Angular template carry the identical
string and one stylesheet paints both. Open `surfaces/03-link-expired.html`: no
component, no script, one `<link>`.

Full argument, and what the first version of ADR 0009 got wrong, in
[ADR 0009](../../docs/adr/0009-the-visual-layer.md).

## ⚠️ Copy: 68 new strings, and they are proposals

`messages/th.proposed.json` holds every Thai string this design needed that does
not exist on `main`. **§16.3 makes the copy normative and the appearance not**,
so this design has no authority to land them. They are written in the register
of the existing catalogue and are for the repo owner to accept, rewrite or
reject one at a time.

**They did not change when the stack changed** — a typeface and a CSS framework
do not touch a sentence. They cover:

| Group | Keys | Note |
|---|---|---|
| `/link-expired` | `expired_*` | §9.4's one sentence had no key at all |
| §12.9 retention | `req_retention_notice`, `rev_retention_notice` | **The spec's own load-bearing-strings table names the retention sentence, and it is missing from `messages/th.json`.** Both populations, §12.9 |
| Scheduler banner | `banner_scheduler_*` | §15.3 — states what it means for the Reviewer's work, not an error code |
| Alerts, Re-run, Resend | `alert_*`, `outcome_*`, `rev_rerun*`, `rev_resend*` | §10.6–10.8 |
| Password change | `rev_pwchange_*`, `rev_pwrule_*` | §17.5. The 20-character **ceiling** is stated on the form, because a password manager silently generates past it |
| Session warning | `session_warn_*` | §10.5 |
| Probe states | `rev_rows_pending*`, `rev_rows_failed*` | §10.2's "pending" and "failed" |
| Late decision | `rev_expired_while_reading_*` | §10.4 — not a bare error |
| Sign-in failure | `rev_login_failed` | The spec gives this one verbatim: `ข้อมูลเข้าสู่ระบบไม่ถูกต้อง` |
| Queue, misc | `rev_queue_*`, `rev_ahead_*`, `a11y_skip_to_form`, … | |

## ⚠️ Three groups of strings on `main` that this design does not use

Not a design opinion — each contradicts a settled spec section. Raised so they
are fixed as copy decisions, not silently left to rot.

| Key(s) | Problem |
|---|---|
| `rev_drain_label`, `rev_drain_note` | *"เวลาดึงข้อมูลโดยประมาณ"* is a **projected runtime estimate**, which §10.2 says the review screen must not show. Stale from #11. |
| `rev_expand_identity`, `rev_approve_locked` | From Reviewer variant C, which was built and rejected. §10.2 chose the **weak** form: it costs a scroll, not a click. |
| `group_01`, `group_02`, `group_03`, `group_201`, `group_301`, `group_501` | The **old six-group D506 set**. The authoritative classification is `docs/disease-groups.md` — **ten** groups keyed `air-pollution`, `silicosis`, `asbestos`, `lead`, `pesticides`, `confined-space`, `radiation`, `work-related`, `environmental-pollution`, `heat`. The picker here uses the ten. |

Also worth a look: `rev_rows_probe_note` says the count comes from upstream
*"ตอนส่งคำขอ"*, but §5.4 moved the Probe off the submit path. A proposed
replacement is in `th.proposed.json` under the same idea.

## Regenerating the fonts

`assets/fonts/` was produced once from Google Fonts and committed. The files are
not fetched at build or run time and must not be — §15.3 rejects an outbound
dependency on a ministry host, and a font CDN is that dependency on the critical
path of first paint.

All three faces are **variable** on `wght` 100–900, so one file per subset covers
400/500/600/700 — 103 KB for the whole set. To refresh, re-download the `thai`,
`latin` and `latin-ext` subsets of **Noto Sans Thai** (the loopless family;
*Noto Sans Thai Looped* is a different family and is ruled out) and the `latin`
subset of **Noto Sans Mono**, then check the `@font-face` unicode-ranges at the
top of `src/app.css` still match.
