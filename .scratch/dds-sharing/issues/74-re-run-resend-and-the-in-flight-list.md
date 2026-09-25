# Re-run, resend and the in-flight list

Status: closed
Blocked by: 73
Source: https://github.com/rawinan-soma/dds-sharing/issues/74 (migrated 2026-09-21)

## What to build

**Sources**: §10.9 (the in-flight list), §10.7 (Re-run), §10.8 (resend), §10.6 (Alerts and the suppression rule), §10.1 (the queue is pending-only); ADR 0015 (the record is contact-free, the screen is not), ADR 0016 (a lapsed Download token ends the Request) and **ADR 0017 (a Reviewer never corrects a Requester's email address)**.

A Reviewer can extract an approved Request a second time, and can resend a Delivery that went missing. Neither is a new judgement — except the one case that is.

**Both of those buttons need somewhere to live, and this slice builds it: the in-flight list.** The queue is pending Requests only — the list of Decisions not yet made — so a decided Request is not on it. Without a second list, Re-run and resend are reachable only through an Alert, and the two cases that raise no Alert (a same-address resend on a healthy Extract, and a Re-run over a *successful* first run) would be unreachable.

**In flight = approved, and not yet terminal.** Terminal is `collected`, `expired_uncollected`, or a failure a Reviewer cleared as `abandoned`. Rejected and expired Requests are never in flight — nothing remains to be done to them, and they leave the Reviewer surface at the Decision.

**Membership is derived at read time, never stored.** No `in_flight` column, no `entered_in_flight` / `left_in_flight` events — the event catalogue stays closed. Same rule as expiry and as Alert widening on deactivation: a Request is on the list because of what is true about it, not because something wrote it there. **The definition of *terminal* lives in exactly one place in the code.**

**It is everyone's Requests.** The approving Reviewer's name is on each row, and any active Reviewer may act on any of them — the name is accountability, not permission. Restricting the list to its approver rebuilds the failure ADR 0013 was written to remove. Re-running a failed extraction and resending a lost email are not the vouching act; that judgement was made and snapshotted already.

**The screen shows the five live contact fields**, read from the Request and never from the Snapshot, for as long as the Request is in flight (ADR 0015). The Snapshot's contact-free rule governs the record, not the screen: clearing a collection lapse needs the telephone number, and a Reviewer chasing an uncollected Extract has to see the address it was sent to.

**Actions are gated by what is physically possible, not by policy:**

| Extraction state | Row reads | Available |
|---|---|---|
| `queued`, `running` | *extracting* | nothing — read-only |
| `ready` | time left on the Download token | Re-run, resend same address |
| `failed` | *extraction failed* | Re-run, and the Alert's clearing outcomes |

There is no Delivery to resend before one has been sent, and a second job under concurrency 1 would queue behind the first and duplicate it. **Re-run over a successful Extract is explicitly allowed** — revoke-at-*ready* is what makes that button safe. Render the queued/running state on the row: "extracting" is the honest answer to why the resend button is missing, and without it a Reviewer assumes the screen is broken.

**Each row shows the time left on the Download token**, wall-clock. This is not the drain estimate the Reviewer surface refuses — that was a prediction about upstream; this is a timestamp that already exists and that the system will act on. **Sort by submit order and nothing more urgent**: the Alert section is the only part of this surface allowed to shout. Like the queue, the list does not auto-refresh, and carries the same manual refresh control and staleness indicator.

**An open Alert suppresses its Request's in-flight row** — a Request appears exactly once on the Reviewer surface, in whichever zone carries the action it needs. Clearing the Alert returns it to the in-flight list if it is still in flight, or drops it entirely if the clearing was the last thing to do.

> ⚠️ **A lapsed Download token ends the Request, and no Reviewer action revives it** (ADR 0016). A Requester who missed the 72 hours resubmits and is judged afresh — possibly by a different Reviewer, possibly to a rejection. The cost is accepted knowingly: the alternative is an approval whose authority outlives its own clock. Do not add a grace window.

**A Re-run is a second extraction of an already-approved Request, started by a Reviewer pressing a button. It is NOT a new Decision.** Same Requester, same parameters, same judgement already snapshotted. Re-judging would put two Decisions on the record for one release, and a reader years later could not tell which authorised what. **The chain must read *approved once, extracted twice*.**

A Re-run:

- produces a **fresh Extract, fresh Download token, fresh 72 h clock** — a new object, so completion-anchored retention applies from the new completion;
- **revokes the previous Download token — at *ready*, never at the press of the button**;
- **does not re-Probe** — the count is already on `probe_performed`, and re-probing would spend upstream budget to re-learn a known number;
- carries the **original Decision's id**;
- takes the next `-rN` filename suffix;
- **defers rather than clears its extraction-failure Alert**.

**One Request never has two collectable Extracts.** A Re-run over a *successful* first run would otherwise leave two live tokens on two clocks — and the link the Requester was most likely to click would be the one most likely to be dead. **Revoking at *ready* rather than at *queued* is what makes the button free**: a failed re-run leaves the original still collectable, so nothing is destroyed until something better exists. The revocation is written by the job, so it carries a `system` actor.

**Pressing Re-run defers an extraction-failure Alert; it does not clear it.** The Alert stays on the queue marked as re-running. A **completed** re-run clears it as actor `system` with outcome `re_ran`; a **failed** one leaves it open with a second attempt recorded and raises no second Alert. **One Alert per broken promise, not one per job.** `re_ran` was never an outcome — it is an action whose outcome is not yet known — and a Reviewer who cleared with it before the second job settled would put one `re_ran` and one open item on the record for a single unkept promise. Same rule as the late collection: **the actor who resolves a thing is the one who actually resolved it.**

**It is a button, never automatic.** Code-atomic retry is already exhausted by the time a job is `failed`, so a self-retry mostly burns another run against an unchanged cause — and under concurrency 1 it blocks every Request behind it. A human who can see *why* it failed decides whether re-running is pointless. *(This never collides with the startup reconcile, which re-enqueues jobs left `running` by a crash — those never reached `failed` and never exhausted anything.)*

**A Reviewer can resend the Delivery. A Reviewer can NEVER see the Download token.** Revealing it would put the capability in a second place and make the Reviewer a channel for case-level data — precisely the boundary the approval gate exists to hold.

- **Resend to the same address**: free, audited, and **never moves the 72 h clock**. The token is never extended by use, and a resend is not use.
- ⚠️ **Resend to a corrected address does not exist, and must not be built.** A Requester who mistypes their own email address has ended their Request — they submit again and are judged afresh, exactly as one who missed their 72 hours does (ADR 0016). Correcting the address would release the Extract to a recipient no Decision covered. **A Reviewer decides who gets data, never where it goes.** Recorded as ADR 0017; the resend control offers no address field.

*(The same-address resend is the whole of this capability. It changes nothing about the release — not the recipient, not the clock, not the token — which is exactly why it needs no Decision.)*

Events: `extraction_rerun_queued` (`reviewer`, carrying the original Decision's id), `download_token_revoked` (`system`, for a ready Re-run, naming the run that superseded it — the only cause, and the only actor), and `extraction_alert_cleared` with `system` / `re_ran` when a deferred re-run completes.

## Acceptance criteria

- [ ] Re-run is a button on an approved Request and writes no second Decision — the record reads approved once, extracted twice
- [ ] A Re-run produces a fresh Extract, token and 72-hour clock, and carries the original Decision's id
- [ ] A Re-run never calls the Probe
- [ ] A Re-run's archive takes the next `-rN` suffix, so no two archives of one Request share a filename
- [ ] The previous Download token is revoked when the new Extract is **ready**, not when the button is pressed
- [ ] A failed Re-run leaves the original token live and collectable
- [ ] Pressing Re-run marks its extraction-failure Alert deferred rather than clearing it, and raises no second Alert
- [ ] A completed Re-run clears the Alert as actor `system` with outcome `re_ran`; a failed one leaves it open with a second attempt recorded
- [ ] `re_ran` is never selectable by a Reviewer as a clearing outcome
- [ ] No code path re-runs a job automatically
- [ ] The Download token is not rendered, logged, or returned by any Reviewer-facing endpoint
- [ ] A same-address resend is audited and leaves the 72-hour clock untouched
- [ ] No resend control anywhere accepts an email address; a resend goes to the address on the Request or does not happen
- [ ] An in-flight list renders beside the pending queue, holding approved Requests that are not yet terminal
- [ ] Membership is derived at read time — no stored status column and no new event type — and *terminal* is defined in exactly one place in the code
- [ ] The in-flight list shows every Reviewer's Requests and lets any active Reviewer act on any of them; the approving Reviewer is named in the dossier's decision line, not on the row
- [ ] The in-flight screen shows the five live contact fields, read from the Request and not from the Snapshot; no Snapshot gains a contact field
- [ ] A `queued` or `running` Request is read-only and its row reads "extracting"; Re-run and both resends appear only on `ready` or `failed`
- [ ] Re-run is offered on a ready, uncollected Extract, not only after a failure
- [ ] Each row shows wall-clock time left on the Download token, renders `queued`/`running` as *extracting*, and the list is sorted by submit order, oldest first, with no urgency ordering — including no ordering by whether a row is actionable
- [ ] The in-flight list does not auto-refresh and carries a manual refresh control with a staleness indicator
- [ ] A Request with an open Alert does not appear on the in-flight list, and returns to it when the Alert is cleared if still in flight
- [ ] A terminal Request — collected, expired uncollected, or abandoned — disappears from the Reviewer surface and exposes no Re-run or resend anywhere

## Blocked by

- #73 — Alerts on the queue




## Comments

**rawinan-soma** — 2026-09-09

> *This was generated by AI during triage.*

## Triage: this slice now builds the in-flight list

Grilled on 2026-09-09. The gap: this ticket says Re-run is "a button on an approved Request" and adds two resends, but #65 builds a **pending-only** queue and nothing else in §10 held a decided Request. The only handle was an Alert (#73) — which does not exist for a same-address resend on a healthy Extract, or for the Re-run over a *successful* first run this ticket explicitly designs for. Both capabilities were unreachable as specified.

**Settled and now in the body:**

- The Reviewer surface has three zones — Alerts, the pending queue, the **in-flight list** — and a Request appears in exactly one at a time.
- **In flight** = approved and not yet terminal (collected / expired uncollected / abandoned failure), **derived at read time**, no new column and no new event type.
- It is **everyone's** Requests; approver named on the row, any active Reviewer may act — ADR 0013's reasoning applied to a list rather than an Alert.
- Actions gated by physics: read-only while `queued`/`running`, everything on `ready` or `failed`.
- Row shows wall-clock time left on the Download token; sorted by submit order, so only the Alert section shouts.

**Spec and glossary updated:** `docs/spec.md` §10.9 (new), §10.1, §10.7, §12.3; `CONTEXT.md` gains **In flight** and amends **Snapshot** and **Alert**. Two ADRs record the decisions a future reader would otherwise reopen: **ADR 0015** (the record is contact-free, the screen is not) and **ADR 0016** (a lapsed Download token ends the Request — no grace path).

Still `ready-for-agent`; scope grew, judgement did not.


**rawinan-soma** — 2026-09-12

Scope changed by fd98274, which lands the design handoff (`docs/design_handoff_dds_sharing/`) and reconciles it with §10. The issue body above is already updated; this records what moved and why.

**Removed from this ticket: resend to a corrected address.**

A Requester who mistypes their own email address has ended their Request and submits again, exactly as one who missed their 72 hours does (ADR 0016). A Reviewer decides *who* gets data, never *where* it goes. Recorded as [ADR 0017](https://github.com/rawinan-soma/dds-sharing/blob/main/docs/adr/0017-a-reviewer-never-corrects-a-requesters-email-address.md).

Consequences for the build:

- The resend control takes **no address field**. A Delivery goes to the address on the Request or it does not go.
- `download_token_revoked` has one cause and one actor: `system`, for a Re-run whose new Extract is ready. ADR 0012 called this the event's *second* writer; it is now the only one.
- `download_token_reissued` is out of the event catalogue entirely — nothing raises it.
- ADR 0015 keeps its conclusion (the screen shows live contact fields while a Request is in flight) and loses one of its two reasons.

**Also changed, from reconciling the handoff against §10.1 and §10.9:**

- The in-flight list is one of **three zones** — Queue (pending only), Alerts, in-flight — and a Request is in exactly one at a time.
- An open Alert **suppresses** its Request's in-flight row entirely. No badge: a badge on a list that does not auto-refresh is the passive list §10.6 forbids.
- Rows render `queued`/`running` as *extracting*, and show wall-clock time left on the Download token.
- **The approving Reviewer's name is not on the row** — it is on the dossier's decision line. Accountability, not a scanning aid. The AC changed accordingly.
- Sort is submit order, oldest first, matching the Queue above it — and explicitly not ordered by whether a row is actionable.

Terminal now includes a failure a Reviewer cleared as *abandoned*, per §10.9. Without it an abandoned failure sits in the in-flight list for ever.

The handoff's screen 7b is the visual source for all of the above. It is a working prototype — sign in with any six-digit code.

**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: **6** แจ้งเตือนและการส่งซ้ำ (the in-flight row, resend, re-run, and the stated absence of an email-correction control).

⚠️ ADR 0017 is still absent from `docs/adr/`. Screen 6 renders it as a stated absence, so **the design is currently the only record** that a Reviewer never corrects a Requester's email address.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.

**rawinan-soma** — 2026-09-24

From #73: an extraction-failure Alert is **deferred** while a Re-run is under way, and a Reviewer cannot clear it (the clear endpoint answers 409) until the re-run settles. Deferral is derived in `apps/api/src/reviewer/alerts.ts` (`openAlerts`): `extraction_rerun_queued` starts it, and only `job_failed` or `extraction_alert_cleared` ends it. **This ticket must make every way a re-run ends settle the Alert** — a completed re-run writes `extraction_alert_cleared` (`system`, `re_ran`), and a failed, lost or stalled one must reach `job_failed` — or the Alert stays deferred and becomes a must-clear item nobody can clear.

**rawinan-soma** — 2026-09-25

Merged in #117 (638368eb2714314a8fed426f301c470c82f7a2f2).
