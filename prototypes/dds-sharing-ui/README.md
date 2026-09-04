# DDS Sharing — the visual design

Hi-fi, no build step, no dependencies. **Open `index.html` in a browser.** It is
a contact sheet linking every surface.

Settled by [ADR 0009](../../docs/adr/0009-the-visual-layer.md). Supplies the
wireframe that is an acceptance criterion of
[#38](https://github.com/rawinan-soma/dds-sharing/issues/38), which gates
[#55](https://github.com/rawinan-soma/dds-sharing/issues/55).

```
index.html          contact sheet — start here
assets/
  fonts.css         @font-face for the self-hosted subsets
  tokens.css        layer 1 primitive → layer 2 semantic → layer 3 component
  base.css          reset, Thai typography, focus, four layout primitives
  components.css    every component; each class maps to one Angular component
  fonts/            IBM Plex Sans Thai + IBM Plex Mono, thai/latin only, 176 KB
surfaces/           the seven routes + the password-change form
emails/             the four Thai emails, plus _shared-notes.md on Outlook
messages/
  th.proposed.json  68 NEW strings — proposals, not decisions. See below.
```

## What is normative here, and what is not

**Normative, carried from the spec and the #11 prototype:** structure, ordering,
and the Thai copy that already exists in `messages/th.json`.

**This design's own contribution, and what ADR 0009 records:** the CSS approach,
the absence of a component library, the typeface, the token architecture, the
palette, the accessibility target, and the responsive behaviour.

**Not normative:** the fake data. Names, reference numbers, row counts and dates
are invented. `REPLACE-WITH-FRONTEND-URL` in the emails is a placeholder for
`FRONTEND_URL`, which §16.2 requires be explicit configuration and never derived
from the `Host` header.

## How an implementer uses this

Every text node carries `data-i18n="key"` naming the `messages/th.json` key that
feeds it. That is the mapping from this markup to a Paraglide call — the
attribute exists so nobody has to guess, and so no Thai sentence gets inlined
into an Angular template (§16.3).

Class names map 1:1 onto components: `.panel`, `.notice`, `.field`, `.kv`,
`.chip`, `.queue-item`, `.decision`, `.toast`, `.banner`, `.error-summary`.

## The six requirements this design is shaped by

These are not style choices, and a review should check them first.

1. **§16.4 — one scrolling page**, in order: approval-gate notice →
   de-identification block → parameters → contact fields → submit. Not a wizard,
   not a two-column live preview.
2. **§16.4 — the de-identification block is open, above the form.** There is no
   `<details>` element on the Requester page. Deliberately.
3. **§10.2 — the decision buttons sit BELOW the identity fields and the ask.**
   The decision block is the last element in the document and is neither sticky
   nor a fixed footer bar; a sticky bar would restore the click the rule exists
   to cost.
4. **§10.5 — the queue never auto-refreshes.** The design's answer is an explicit
   refresh control with an "as of" time beside it, so the screen states its own
   staleness rather than hiding it.
5. **§9.4 — one identical expiry page** for all four failure states. No reference
   number, no prefill, no resubmit link, no "try again".
6. **§10.6 — an Alert is cleared only by naming an outcome from a closed set.**
   Radio buttons, never a text box.

## ⚠️ Copy: 68 new strings, and they are proposals

`messages/th.proposed.json` holds every Thai string this design needed that does
not exist on `main`. **§16.3 makes the copy normative and the appearance not**,
so this design has no authority to land them. They are written in the register
of the existing catalogue and are for the repo owner to accept, rewrite or
reject one at a time. They cover:

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
| `group_01`, `group_02`, `group_03`, `group_201`, `group_301`, `group_501` | The **old six-group D506 set**. The authoritative classification is `docs/disease-groups.md` — **ten** groups keyed `air-pollution`, `silicosis`, `asbestos`, `lead`, `pesticides`, `confined-space`, `radiation`, `work-related`, `environmental-pollution`, `heat`. The picker in this prototype uses the ten. |

Also worth a look: `rev_rows_probe_note` says the count comes from upstream *"ตอน
ส่งคำขอ"*, but §5.4 moved the Probe off the submit path. A proposed replacement
is in `th.proposed.json` under the same idea.

## No build step, and no `package.json`

Deliberate. This directory has no dependency, no lockfile and no toolchain: the
CSS is hand-written, the fonts are committed, and `index.html` opens by
double-clicking it. That is the point — a prototype that needs installing is a
prototype nobody opens.

The design adds exactly one runtime dependency to the *application*, and it is
not a styling one: `pnpm add @angular/cdk`, for `LiveAnnouncer` and `FocusTrap`.
**pnpm, never npm** ([#37](https://github.com/rawinan-soma/dds-sharing/issues/37)).

## Regenerating the fonts

`assets/fonts/` and `assets/fonts.css` were produced once from Google Fonts and
committed. They are not fetched at build or run time and should not be. To
refresh, re-download the `thai`, `latin` and `latin-ext` subsets of IBM Plex Sans
Thai (400/500/600/700) and IBM Plex Mono (400/500) and rewrite `fonts.css` with
relative `./fonts/…` paths.
