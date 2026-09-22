# The Reviewer queue and review screen

Status: closed
Blocked by: 63, 64
Source: https://github.com/rawinan-soma/dds-sharing/issues/65 (migrated 2026-09-21)

## What to build

A signed-in Reviewer sees the queue of pending Requests, picks one, and reads everything they need to judge it. Read-only — approve and reject arrive in the next slice.

**A split queue: list on the left, detail on the right.** Browsing and picking is kept. A no-list, one-at-a-time hand-off and an approve-gated-on-expanding-identity variant were both built and rejected as friction that buys engagement it cannot verify.

**The queue lists pending Requests only, and that is by design** — it is the list of Decisions not yet made. Decided Requests are not on it: an approved Request moves to the in-flight list and anything needing a human lands in the Alert section, both built in later slices (#73, #74). Build the queue so a second list can sit beside it without rework; do not add one here, because before Decisions exist it would always be empty.

**The queue does not auto-refresh.** This is not an omission — only user-initiated requests extend the session, and a polling screen would reset the idle timer for ever, which makes an idle timeout that never fires. Mail is the notification channel, so the screen does not need to be live. Provide a manual refresh control that shows how stale the list is.

**The review screen shows, and only shows:**

- The **five contact fields** — name, surname, telephone, email, workplace.
- The **Request parameters in human terms** — Disease group *name*, inclusive dates, area *name*. Never codes as the headline. The Report codes the group expanded to sit **beneath the name, collapsed**: available, never the headline. The name is what is being judged; the expansion is what makes the Decision legible years later.
- **Submit time and time remaining** on the business-hours clock, shown so a Reviewer feels the clock without the queue reading as an alarm.
- **How many Requests are ahead of this one**, and nothing more precise.

**Prior-Request history was offered and declined.** The Reviewer never sees case rows, and there is no facility parameter.

**No projected drain estimate, and do not add one.** A "this will start in ~40 min and take ~20" line was removed for two compounding reasons: the Reviewer is forbidden to act on runtime, so it is decoration on the one screen this design depends on being read; and there is nothing left to project. Queue position is what replaces it — an honest statement about the queue rather than a prediction about upstream.

> **Requirement, not styling: the decision buttons sit BELOW the identity fields and the ask.** Approve must not be reachable without scrolling past what is being judged. This is load-bearing because the Reviewer's name goes permanently onto the release. It is deliberately the **weak** form — it costs a scroll, not a click, and a Reviewer determined to rubber-stamp still can. A hard gate was available and declined. Do not "improve" this by floating the buttons or pinning an action bar.

The row-count field has a place on this screen but no value yet — the Probe is a later slice. Render whatever placeholder is honest for now; the three real states arrive with it.

The business-hours clock is Mon–Fri 08:30–16:30 ICT minus Thai public holidays from a checked-in config file reviewed annually, and it only advances inside those windows — a 02:00 Sunday submit starts counting at 08:30 Monday. **A stale holiday list can only make expiry more generous, never less.** That is the safe failure direction; do not "fix" it the other way. Request expiry at 24 business hours is a **predicate computed at read time**, never a scheduled state change, so a Request past the threshold is simply not actionable and a dead scheduler cannot un-expire one.

## Acceptance criteria

- [ ] `/reviewer` shows a split queue, list left and detail right, behind authentication
- [ ] The queue lists pending Requests only, and its layout leaves room for a second list beside it without rework
- [ ] The queue does not poll or auto-refresh, and a manual refresh control shows how stale the list is
- [ ] The review screen shows the five contact fields, the Disease group name, inclusive dates and the area name
- [ ] The Report codes the group expanded to are present but collapsed beneath the group name
- [ ] Submit time and time remaining render on the business-hours clock
- [ ] Queue position renders as a count of Requests ahead, with no drain estimate or runtime prediction anywhere
- [ ] ~~The decision buttons render below the identity fields and the ask, requiring a scroll past both, and are neither floated nor pinned~~ — **moved to #66**: this describes #66's Approve/Reject UI, not this read-only slice (see "What to build" above: "Read-only — approve and reject arrive in the next slice"). Mis-filed here; flagged during pr-clearance on PR #89.
- [ ] No case row and no prior-Request history appears anywhere on the Reviewer surface
- [ ] The business-hours clock reads holidays from a checked-in config file and only advances Mon–Fri 08:30–16:30 ICT
- [ ] Expiry at 24 business hours is computed at read time; a Request past the threshold renders as not actionable

## Blocked by

- #63 — Submit a Request
- #64 — Reviewer accounts and sign-in



## Comments

**rawinan-soma** — 2026-09-09

> *This was generated by AI during triage.*

## Triage: the queue is pending-only, and that is a decision

Grilled on 2026-09-09. The body said "the queue of pending Requests" without saying it was deliberate, leaving the next reader to wonder where decided Requests went.

**Settled and now in the body:** the queue lists pending Requests only. Approved Requests move to the **in-flight list** (#74) and anything needing a human to the **Alert** section (#73), both later slices. This ticket builds neither — before Decisions exist an in-flight list is always empty — but its layout must leave room for a second list beside it. One acceptance criterion added.

Spec: `docs/spec.md` §10.1. Still `ready-for-agent`.


**rawinan-soma** — 2026-09-12

**Design reference:** `docs/design_handoff_dds_sharing/`, landed in fd98274. Read its `README.md` first; the prototype runs (sign in with any six-digit code).

**Your screen: 7b (Queue and dossier)** — the split, the sidebar's Queue zone, and the read-only dossier. The action strip is #66's and the in-flight list is #74's.

The design **as committed** matches this ticket. It did not when it arrived, and the same commit fixed it — so if you see an older copy, this is what changed:

- **The sidebar is three zones, not one list** (§10.1): Queue (pending only), Alerts, in-flight. A Request is in exactly one at a time, whichever carries the action it needs. **Build only the Queue zone here.** The other two arrive in #73 and #74, and the design already shows where they sit — which is the point of building against it now.
- **Queue rows carry no `● ALERT` badge.** It was removed: §10.6 rejects a badge on a list that does not auto-refresh.
- **Oldest first**, on the 24-business-hour clock.

Worth lifting more or less as written: **`businessHoursBetween(from, to)` and `addBusinessHours(from, hours)`** in the prototype. They drive the *"N h NN m left"* countdown and the decision deadline, and the README flags them as the arithmetic worth porting.

Also from the design, and load-bearing rather than decorative: the header's *"the list does not poll"* note (a polling screen keeps the session alive for ever — §10.5), the manual **Refresh** with its staleness line, and the empty-queue copy that **branches on whether alerts are open** — with alerts outstanding it says the desk is not clear and points at them, rather than saying there is nothing to do.

Treat it as the source of **visual layout only**. Do not port `support.js`; the `SIMULATE · SCAFFOLDING` dock is not product; all data is fixtures.

**rawinan-soma** — 2026-09-17

Reopening: the implementation was discarded. The branch carrying this work (ticket#70) and its PR were deleted, so nothing on any branch satisfies this ticket. Back to ready-for-agent.

**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: **5** คิวและแฟ้มคำขอ (the split queue and dossier), the probe's three states on **11** สถานะของแฟ้มคำขอ, and both empty queues on **12** คิวว่างและเซสชัน.

The three queue zones are drawn, including the line saying a Request with an open alert is not shown twice. The decision buttons sit below the identity fields and the ask, and `docs/design/handoff.md` states that as a tab-order requirement as well, so the rule cannot be satisfied visually while being broken by keyboard.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.

Merged in #107 (bc98ae6b347a5f1797c8419e028daef08c1c4739).
