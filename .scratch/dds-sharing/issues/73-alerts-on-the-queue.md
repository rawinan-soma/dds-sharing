# Alerts on the queue

Status: ready-for-agent
Blocked by: 72, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/73 (migrated 2026-09-21)

## What to build

The three things that need a human land on the Reviewer queue as must-clear items, and a Reviewer clears each by naming an outcome from a fixed list.

**An Alert is a must-clear queue item, never a passive list.** The queue does not auto-refresh, so a passive list is a list nobody looks at. It is cleared **only by naming an outcome from a closed set, never free text** — the count of each outcome is the only measure this service has of how often its silent failures actually happen.

**An open Alert is where its Request lives.** Every alerted Request is also an in-flight Request (#74), so without a rule it would appear in two places at once. **While its Alert is open, a Request is suppressed from the in-flight list**; clearing the Alert returns it there if it is still in flight — a cleared collection lapse on an Extract still inside its 72 hours — or drops it from the surface entirely if the clearing was the last thing to do. **A Request appears exactly once on the Reviewer surface, in whichever zone carries the action it needs.** Rendering Alerts as a badge on the in-flight list instead was rejected: a badge on a list that does not auto-refresh is exactly the passive list this ticket forbids.

**Three kinds:**

| Alert | Raised by | Assigned to | Cleared by | Outcomes |
|---|---|---|---|---|
| **Send abandoned** | 5 failed send tries | approving Reviewer | that Reviewer | as collection lapse |
| **Collection lapse** | 24 wall-clock hours, zero Attempts, raised in business hours | **the approving Reviewer, by name** | that Reviewer, or `system` on late collection | reached the Requester / could not reach the Requester / no action needed |
| **Extraction failure** | a job reaching `failed` | the approving Reviewer | **any Reviewer** | `contacted_requester` / `abandoned`, or `re_ran` written by `system` |

**Why collection lapse is assigned strictly by name**: the action is *phone the Requester you personally vouched for*, and that Reviewer already formed a judgement about this person and has the telephone number in front of them.

**Why an extraction-failure Alert may be cleared by anyone**: the action is often just "re-run", and two reachable people is the real availability unit. With a two-person team the assigned Reviewer is on leave a material fraction of the time, and an alert only one person can clear is an alert that waits for them. **The clearing Reviewer is recorded separately from the assigned one.**

**Assignment and clearing are two different things. Deactivating a Reviewer widens their open Alerts to any active Reviewer, and never rewrites the assignment.** A Reviewer is never removed, only deactivated, so without this a by-name Alert outlives the only person permitted to clear it — a must-clear queue item nobody can clear, which is the one thing an Alert may never be. The name of the Reviewer who vouched stays where it is; only the eligible set grows. **The widening is derived from `deactivated_at` at read time — no event announces it, and no type is added to the closed catalogue.** Blocking deactivation until Alerts are cleared was rejected: deactivation is frequently not voluntary, and that would keep an account live at the moment the organisation most wants it shut.

**A late collection clears its lapse as actor `system`, never `reviewer`.** No one gets credit for a call they did not make, and the lapse count must stay honest.

**Two watchers, told different things.** A failed extraction is simultaneously a technical fault only shell access can fix and a broken promise to a named person only a Reviewer will contact. Assigning both halves to one watcher is how this goes wrong: tell only the operator and the Requester is never contacted; tell only the Reviewer and the alert becomes wallpaper, because **a Reviewer cannot fix a failed extraction**. The operator gets `/health` and the scheduler-class banner; the approving Reviewer gets the must-clear Alert.

> ⚠️ **There is deliberately no "Probe stalled" Alert, and adding one is a regression.** A stalled Probe leaves a Request approvable with a pending count and strands nobody. An Alert must be a must-clear queue item, and that one would be a must-clear item for a condition nobody is harmed by.

**Extraction failure belongs to the broken promise, not to the job.** That is why the next slice's Re-run *defers* it rather than clearing it, and why only an Extract that actually arrives resolves it. Build the Alert so that deferral is possible.

Events: `extraction_alert_raised`, `extraction_alert_cleared` (`system` or `reviewer`; carrying **both** the assigned and the clearing Reviewer, and the count of re-run attempts), `delivery_alert_raised`, `collection_lapse_cleared` (`system` = collected late; `reviewer` carries the closed three-value outcome and **both** Reviewers — they differ when the assigned Reviewer was deactivated).

## Acceptance criteria

- [ ] Each of the three Alert kinds appears on the queue as a must-clear item, not a passive list entry
- [ ] Clearing an Alert requires selecting an outcome from that kind's closed set; no free-text field exists on any clear path
- [ ] Collection lapse and send-abandoned are assigned to the approving Reviewer by name
- [ ] An extraction-failure Alert is assigned to the approving Reviewer but clearable by any active Reviewer
- [ ] Deactivating a Reviewer widens their open Alerts to any active Reviewer, derived from `deactivated_at` at read time, with no event written and no new event type
- [ ] A widened Alert's assignment is unchanged — the assigned Reviewer's name stays on it
- [ ] Deactivation is never blocked by open Alerts
- [ ] `collection_lapse_cleared` and `extraction_alert_cleared` both carry the assigned and the clearing Reviewer as separate fields
- [ ] A late collection clears its lapse with actor `system` and never attributes it to a Reviewer
- [ ] An extraction-failure Alert can be marked deferred without being cleared
- [ ] No Alert of any kind exists for a stalled or abandoned Probe
- [ ] A failed extraction reaches the operator through `/health` and the approving Reviewer through the Alert, by two separate paths
- [ ] A Request with an open Alert appears in the Alert section only, and never simultaneously on the in-flight list
- [ ] Clearing an Alert returns its Request to the in-flight list when it is still in flight, and removes it from the surface when it is not

## Blocked by

- #72 — The tick: scheduled work, the business-hours clock and object deletion


## Comments

**rawinan-soma** — 2026-09-09

> *This was generated by AI during triage.*

## Triage: Alerts vs the in-flight list — appears exactly once

Grilled on 2026-09-09. #74 now builds an **in-flight list** (approved, not yet terminal). Every alerted Request is also in flight, so without a rule it shows in two places and a Reviewer clears it in one while it sits in the other.

**Settled and now in the body:** an open Alert **suppresses** its Request's in-flight row; clearing returns it if still in flight, or drops it from the surface. A Request appears exactly once, in whichever zone carries the action it needs. Rendering Alerts as a badge on the in-flight list was rejected — a badge on a list that does not auto-refresh is the passive list this ticket forbids. Two acceptance criteria added.

Spec: `docs/spec.md` §10.6. Still `ready-for-agent`.


**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: **6** แจ้งเตือนและการส่งซ้ำ (alert clearing with its closed outcome set), and the alerts-outstanding empty queue on **12** คิวว่างและเซสชัน.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.
