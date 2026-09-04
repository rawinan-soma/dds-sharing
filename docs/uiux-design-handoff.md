# Handoff — UX/UI design for `dds-sharing`

**Written:** 2026-09-04 · **Repo:** `/Users/rawinan/Full-Stack-Projects/dds-sharing` (branch `main`, clean)
**Next session's job:** produce the visual design (wireframe or hi-fi prototype) for this service, and land it back in the issue loop.

---

## 1. What this project is

A Thai Ministry of Public Health service. A **Requester** (a public-health officer) asks for a
de-identified CSV Extract of DDS epidemiological surveillance data; a **Reviewer** approves or
rejects within 24 business hours; an extraction job runs; the Requester collects a zip via a
one-time emailed token and it is destroyed.

Do not re-derive the domain — read these instead:
- `CONTEXT.md` — domain vocabulary
- `docs/spec.md` (2,680 lines) — the authoritative spec
- `docs/adr/0001`–`0008` — settled decisions

---

## 2. Why you are being asked to design

The build backlog (GitHub issues #37–#55) covers **UX as behaviour, copy and structure**,
but **no issue and no ADR states the visual layer**. Verified absent from `docs/spec.md`,
all ADRs and `CONTEXT.md`: any mention of Tailwind, Angular Material, PrimeNG, Bootstrap,
SCSS, or a font choice.

`docs/spec.md` §16.4 assigns it explicitly:

> "This prototype settled structure, ordering and copy only. **The repo owner supplies a
> wireframe during the dev cycle.** Visual design, spacing, typography and component choice
> are **not** settled here."

That wireframe is an acceptance criterion of **issue #38** ("Wireframe supplied and linked
from this issue"), which gates **#55 First deploy**. `prototypes/` on `main` is empty.

---

## 3. Surfaces to design

Authoritative route table: `docs/spec.md` §16.2 (line ~2163).

| # | Route | Served by | Spec |
|---|---|---|---|
| 1 | `/` | Angular | §16.4 — Request form, one scrolling page. **The heavy one.** |
| 2 | `/submitted` | Angular | §16.4 — confirmation; client state only, nothing in the address |
| 3 | `/link-expired` | Angular | §9.4 — one sentence + telephone number |
| 4 | `/reviewer/sign-in` | Angular | issue #45 |
| 5 | `/reviewer` | Angular | §10.2 — split queue, list left / detail right |
| 6 | `/reviewer/<request>` | Angular | §10.2 — the review screen. **The other heavy one.** |
| 7 | `/d/<token>` | **NestJS, not Angular** | §9, ADR 0003 — must work with the Angular bundle absent, so it cannot share Angular components |

Plus, not routes but design work:
- Reviewer password-change form (#44)
- Session T-5-minute warning — **bottom-left toast, not a modal, not a banner** (#45)
- Scheduler-stopped Thai banner on the queue (#42, #47)
- Alert items in the queue; Re-run / Resend controls (#52, #53)
- Four Thai email templates (#50) — they render in Outlook

---

## 4. Hard constraints — these are requirements, not taste

Violating any of these is a spec change, not a design choice.

- **Thai is the only language shown to a person.** No language switcher, no English UI,
  no language prefix in any address (§16.3). `messages/en.json` is deliberately unmaintained.
- **All copy comes from `messages/th.json`** (125 lines, on `main`) via Paraglide,
  `baseLocale: "th"`, `locales: ["th"]`. **The copy is normative; the appearance is not.**
  Six load-bearing strings each carry a decision that exists nowhere else — see the table at
  `docs/spec.md` §16.3 (~line 2227). Do not rewrite them, do not inline Thai in a template.
- **§16.4 ordering rule:** the Request page is *one scrolling page* — not a wizard, not a
  two-column live preview — in this order: approval-gate notice → de-identification block →
  parameters → contact fields → submit. **The de-identification block is open, above the
  form, not collapsed**, visible without interaction.
- **§10.2 ordering rule:** on the review screen, **the decision buttons sit BELOW the
  identity fields and the ask.** Approve must not be reachable without scrolling past what
  is being judged.
- **The Reviewer queue never auto-refreshes** — polling would reset the session idle timer
  for ever (#45, #47).
- `/` and `/submitted` are **unauthenticated**; `/submitted` must hold nothing in the address.
- `/link-expired` renders **one identical page for all four failure states**, with no
  reference number, no prefill, no resubmit link (§9.4).
- Requester form has **exactly three parameters**: Disease group picker (Thai family name,
  never the numeric code), inclusive from/to capped at 365 days with the picker greyed out
  beyond `from + 365`, and an optional Area (one province *or* one health region 1–13,
  never both).
- The review screen shows a **fixed list** of items and explicitly **must not** show a
  projected runtime estimate, prior-Request history, or a per-code count breakdown as the
  headline (§10.2).
- **Stack is Angular** (plain SPA, no SSR, no prerendering, one build — ADR 0003).
  Design for Angular components, not React.

---

## 5. Existing material to build on

- **Prototype branch `prototype/requester-reviewer-ui`** (local + `origin`, commit `0ce39ce`) —
  `prototypes/requester-reviewer-ui/index.html` plus its own `messages/th.json` and a
  `sync-messages.py`. Came from closed issue #11. **Its structure, ordering and copy are
  settled and normative; its styling is explicitly NOT.** Read it for content, ignore its look.
- `docs/disease-groups.md` — the ten Disease groups, Thai names, for the picker
- `docs/provinces.csv`, `docs/districts.csv` — Area selection data
- `docs/Screenshot 2569-08-27 at 09.45.*.png` — screenshots of the upstream DDC system (3 files)
- `docs/DDS_Envocc_080169.pdf`, `docs/project-charter.md` — programme context

---

## 6. Open decisions the design must settle

None of these are decided anywhere. Pick deliberately and record the reasoning:

1. **CSS approach** — Tailwind / plain SCSS / a library's own theming
2. **Component library** — Angular Material, PrimeNG, or hand-rolled
3. **Thai font.** This one matters most and is not a cosmetic call: the entire UI is Thai and
   default system stacks render Thai poorly. Candidates: Sarabun (Thai government convention),
   IBM Plex Sans Thai, Noto Sans Thai. Consider Thai line-height and the absence of word spaces.
4. Spacing scale, type scale, colour tokens
5. Responsive behaviour — สคร. officers on ministry laptops; connection quality is poor enough
   that §16.2 makes the download endpoint support range requests
6. Accessibility / contrast targets — no policy currently stated anywhere

---

## 7. How the design lands back in the issue loop

Agreed with the user earlier in the session, in this order:

1. **Check the artifact into the repo** — `docs/design/` for wireframe exports; the hi-fi
   prototype's HTML/CSS into `prototypes/`. A bare Figma link will rot; an agent building
   #43 needs something in git it can open.
2. **Comment on issue #38 with the link and tick its box** — that is literally its acceptance
   criterion, and closing #38 un-gates #55.
3. **Push what the design *settles* into the durable docs**, because the build issues read
   the spec, not Figma:
   - Component library / CSS / typography choice → a **new ADR `docs/adr/0009-…`**
   - New UI vocabulary → `CONTEXT.md`
   - Anything that changes structure, ordering or copy → **edit `docs/spec.md` §16.4 / §10.2
     and say so in the issue.** Design work that contradicts the spec is a spec change, never
     a silent override.
4. Optionally add a "design reference: `docs/design/…`" line to **#43** and **#47**.

Repo conventions: issues via `gh` CLI (`docs/agents/issue-tracker.md`), triage labels
(`docs/agents/triage-labels.md`), domain docs (`docs/agents/domain.md`).

---

## 8. Build-order context (why the timing matters)

`#38` and `#37` are the only issues with no blockers. Every UI-bearing issue — **#43**
(Requester form), **#45** (sign-in), **#47** (queue + review screen), **#51** (collection and
expiry pages) — sits in waves 2–5 of the dependency graph. So there is time, but if the
design is not settled before #43 and #47 start, two agents will invent two different looks.

---

## 9. Suggested skills for the next agent

Call the Skill tool for these:

- **`ui-ux-pro-max:ui-ux-pro-max`** — start here. Searchable local data on styles, palettes,
  font pairings and UX guidelines; the right entry point for an internal government tool
  that must look credible rather than fashionable.
- **`frontend-design`** — aesthetic direction and typography, so the result does not read as
  a templated default. Particularly relevant to the Thai font decision.
- **`ui-ux-pro-max:design-system`** — for the token architecture (primitive → semantic →
  component) that ADR 0009 will record.
- **`design`** (Claude Design canvas) — if the user wants multi-artboard screen flows they
  can push around visually rather than in code. Good fit for laying all 7 screens on one canvas.
- **`mattpocock-skills:prototype`** — if the goal is a throwaway hi-fi prototype to answer a
  design question rather than a deliverable.
- **`mattpocock-skills:domain-modeling`** — when writing ADR 0009 or editing `CONTEXT.md`;
  it is the repo's own convention for both.

Probably not needed: `excalidraw`, `drawio` (these are diagramming tools, not UI design),
`ui-ux-pro-max:brand` (no brand programme in scope — this is a ministry internal tool).

---

## 10. Notes on the user

- Thai speaker; comfortable in English but writes briefly. Prefers short, direct answers.
- Is the repo owner and the person §16.4 names as supplying the wireframe.
- Intends to use a design skill/plugin for the visual work rather than hand-drawing it, and
  asked specifically how the output gets back into the issue loop — section 7 is the answer
  they already agreed to.
- No sensitive credentials appear in this document. Note that issue #38 involves `SMTP_PASS`
  and other secrets — **those are not design work and must not be pulled into a design session.**
