# The Decision

Status: ready-for-agent
Blocked by: 65
Source: https://github.com/rawinan-soma/dds-sharing/issues/66 (migrated 2026-09-21)

## What to build

A Reviewer approves or rejects a Request. The Decision carries their name, a Snapshot of what they had on screen, and — on reject — a mandatory internal note the Requester never sees. A rejection sends an email that gives no reason. An approval marks the Request approved; releasing the extraction job into the queue is the next slice's job.

**What the Reviewer judges.** Two of the five contact fields carry the judgement: the **name** and the **Workplace**. One question is asked of them — *does this person exist today, and do they work at the Workplace they named?* That question is the whole test. **Size is never a second one.** A large Request is slow, not illegitimate, and a long extraction completes rather than being refused.

**Uncertainty is not a rejection. It is a telephone call.** Where the Reviewer cannot answer that question from what is on screen, they contact the Requester on the supplied number **before** deciding either way. Rejecting the uncertain case is not the safe default: it silently converts *"I could not tell"* into *"this person is not who they say"*, and the Requester is never told which.

> **The call is not recorded.** No event, no field on the screen. The cost is stated rather than discovered: in exactly the cases where the gate worked hardest, the record shows a Decision and a Snapshot with no trace of what resolved the doubt. Accepted, because the alternative is a field a Reviewer fills in under time pressure, whose accuracy nothing checks, and which would read as evidence. **Do not add one.**

**Approve or reject. Nothing else.** A Reviewer cannot modify a Request — an editable Request breaks the audit chain, because what was approved would no longer be what was asked and the record could not say which the human actually judged. Too broad? Reject and let them resubmit narrower.

**Reject requires a mandatory internal note**, never shown to the Requester and never sent anywhere. **The note is never persisted client-side** — it is retyped, because a shared สคร. desktop is the wrong place for internal notes to linger. A mistyped note is corrected by a `note_amended` event citing the one it corrects, never by an edit.

**The rejection email gives no reason** — "not approved; contact … if you believe this is an error". A Requester-visible reason field is a trap: it invites the Reviewer to write something that becomes a disclosure or a negotiation. Silence about *whether* a Request was refused would guarantee resubmission loops, so the refusal itself is stated; only the reason is not. The no-reason rule was already stated to the Requester on the form, so it is not sprung at rejection time. Its wording is a decision and lives in the copy catalogue, not in a template.

**The Decision carries a Snapshot** — the Disease group's name over the Report codes it expanded to, the dates, the Area selection, the row count and the Workplace. **Never the contact details.** It makes a Decision legible on its own, years later. A Reviewer cannot modify a Request so content cannot drift; the Snapshot exists for the reader in year five.

**What the Reviewer sees the instant a Decision lands.** The Decision is user-initiated, so re-rendering after it is not the polling the session rules forbid. **The detail pane replaces the decision buttons with a plain statement of what was recorded** — *approved by you at 14:32; the Requester will be emailed when the Extract is ready*, or *rejected; the Requester was told no reason* — and the Request drops out of the pending list in that same response. The approve confirmation names the in-flight list (#74), which is how a Reviewer learns it exists. A rejected Request leaves the Reviewer surface for good at this moment; an approved one moves to the in-flight list.

> ⚠️ **Do not auto-advance to the next pending Request.** Loading the next one into a Reviewer's momentum undoes the scroll-past-the-identity requirement in a single keystroke — that requirement exists to make each Decision cost something. A toast is also not enough: approve and reject have **different** consequences the Reviewer should see stated once — one released a job and put their name permanently on a release, the other sent an email that gives no reason — and a toast is where that sentence goes to die.

**Expiry beats a late Decision.** The handler re-derives elapsed business hours **before it inserts** and refuses if the Request is past the threshold — otherwise "expired" would mean "expired unless a tick was slow". The refusal is not a bare error: the Reviewer just spent real attention on that Request, so the screen says plainly that it expired while they were reading, and the `expired` event payload records that a Decision was attempted and refused. That is the signal that the 24-hour window is too tight for the Reviewers actually staffing it.

**An in-flight Decision is never replayed after re-authentication.** A submit arriving on a dead session is rejected outright; the Request stays pending and the Reviewer must click approve **again**, deliberately, in the new session. Auto-replay would put a Reviewer's name permanently on a release for a click made in a session that had already ended. It happens inside a live authenticated session or it did not happen.

Events: `approved` and `rejected` (both `reviewer`, both carrying the Snapshot; `rejected` also the note), `note_amended`, and `expired` with its `{notified_at, business_hours_elapsed, reviewer_accounts_active, decision_attempted_and_refused}` payload.

> That `expired` payload is performance data about named staff on a permanent record. It is kept knowingly — it is what makes the 24-business-hour service promise measurable rather than anecdotal.

## Acceptance criteria

- [ ] Approve and reject are the only two outcomes; no field on the Reviewer surface can modify a Request
- [ ] Reject is refused without an internal note, and the note is never sent to the Requester or persisted client-side
- [ ] Correcting a note writes a `note_amended` event citing the corrected event; no event row is ever updated
- [ ] The rejection email states the refusal and gives no reason, and its wording lives in both copy catalogues
- [ ] Both `approved` and `rejected` carry a Snapshot holding the group name over its Report codes, dates, Area selection, row count and workplace — and no contact field
- [ ] The Decision handler re-derives elapsed business hours immediately before insert and refuses a Decision past the threshold
- [ ] A refused late Decision shows the Reviewer plainly that the Request expired while they were reading it
- [ ] The `expired` event payload records that a Decision was attempted and refused, alongside elapsed business hours and active Reviewer count
- [ ] A Decision submitted on a dead session is rejected outright, leaves the Request pending, and is never replayed after re-authentication
- [ ] After a Decision the detail pane states plainly what was recorded, replacing the decision buttons, and the Request leaves the pending list in the same response
- [ ] The approve confirmation names the in-flight list; the reject confirmation states that no reason was sent
- [ ] No code path loads the next pending Request automatically after a Decision
- [ ] Nothing about the Decision consults or waits on a row count

## Blocked by

- #65 — The Reviewer queue and review screen


## Comments

**rawinan-soma** — 2026-09-09

> *This was generated by AI during triage.*

## Triage: the post-Decision screen was unspecified

Grilled on 2026-09-09. This ticket covered the *refused late* Decision screen and never the successful one — an agent had to invent what a Reviewer sees the instant approve or reject lands.

**Settled and now in the body:** confirm in place. The detail pane replaces the buttons with a statement of what was recorded, the Request leaves the pending list in the same response, and **no auto-advance** — loading the next Request into a Reviewer's momentum undoes the scroll-past-the-identity requirement in one keystroke. Approve's confirmation names the in-flight list (#74), which is how a Reviewer discovers it. Three acceptance criteria added.

Spec: `docs/spec.md` §10.3. Still `ready-for-agent`.


**rawinan-soma** — 2026-09-12

**Design reference:** `docs/design_handoff_dds_sharing/`, landed in fd98274. Read its `README.md` first; the prototype runs (sign in with any six-digit code).

**Your screens: 7b's action strip** (the dossier's pending-state actions and both confirms) **and 5b (Rejection email).**

From screen 7b, on a hairline top rule below the judgement line:

- **Approve and release** (primary) + **Reject** (secondary), with *"Approving is irreversible. A request that is too broad is a reject the requester can narrow and resend, never an edit."*
- **Approve** opens an accent-tinted confirm naming the Reviewer: *"Your name, {reviewer}, goes onto this release permanently."*
- **Reject** opens the internal-note field — required, min 10 characters, kept on the record, never shown or sent to the Requester, and **explicitly not saved as you type** (*"a shared desk is the wrong place for this to linger"*, §10.5).

Screen 5b is the rejection email: the same shell as the delivery email, and it **says it was not approved and says nothing else.** No reason, no Reviewer's name. It carries a telephone number and the reference so someone wrongly refused has a route back. The prototype documents the reasoning on-screen beneath it — a reason invites argument and teaches people how to phrase the next attempt.

Treat it as the source of **visual layout only**; this ticket and §10.3 own the behaviour. One caution from the README's known gaps: **the email copy is the designer's rather than the spec's** — have the wording owner read 5b before it ships, because a rejection's wording *is* the decision (§16.3).

Do not port `support.js`; the `SIMULATE · SCAFFOLDING` dock is not product; all data is fixtures.

**rawinan-soma** — 2026-09-17

Reopening: the implementation was discarded. The branch carrying this work (ticket#70) and its PR were deleted, so nothing on any branch satisfies this ticket. Back to ready-for-agent.

**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: the decision actions on **5** คิวและแฟ้มคำขอ, and the approve confirmation and reject note on **11** สถานะของแฟ้มคำขอ.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.
