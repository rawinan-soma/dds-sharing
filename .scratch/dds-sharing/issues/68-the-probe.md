# The Probe

Status: closed
Blocked by: 65, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/68 (migrated 2026-09-21)

## What to build

A submitted Request reaches the queue immediately with its row count **pending**, the Probe runs behind the submit path, and the count fills in on the review screen. Where the Probe is abandoned the count reads **failed**. **Approve stays fully usable in all three states.**

**One `page_size=20` upstream call per Report code, over the Request's whole span**, purely to read exact `meta.total_items`. The Request's total is the sum across the Disease group's codes. A Request's span is capped at 365 days and so is upstream's, so the whole span is always one legal call — this mirrors the extraction job's fetch exactly, same span, same one-call-per-code shape, differing only in `page_size`. Its date range comes from the **shared span builder**; the Probe must not know how to build a date range.

**It runs off the synchronous submit path.** The widest group is ten codes at ~3.5 s each — ~35 s, which is far too long for a form. Submit returns immediately and the queue item appears at once.

> ⚠️ **A Reviewer MAY approve before the count lands. Do not "fix" this.** An earlier draft disabled approve until it did, on the stated ground that the count was "the proportionality signal the gate exists for". **That ground is false.** The gate is about who is asking, not how much they ask for; long runtime is not a reason to reject. Blocking approve made a real person wait for a number they are not permitted to act on.

**Nothing waits on the Probe — human or machine.** The extraction job's disk pre-check is a fixed free-space floor rather than a projection from the row count, so an approved job starts immediately whether the count has landed or not.

**A Probe whose calls exhaust their retries is abandoned**, not retried for ever. Each call retries on the same discipline as a fetch — 3 attempts, exponential backoff, 60 s timeout. When a code's calls exhaust their attempts the **whole Probe** is abandoned and the count displays as **failed** rather than pending. The only thing lost is the zero-row catch for that Request; the Extract is produced regardless, and correctness rests on the run-time completeness assert, which the Probe never fed.

> ⚠️ **There is deliberately no "Probe stalled" Alert, and adding one is a regression.** One was specified while approve was blocked on the count; that block is gone, and with it the only person a wedged Probe could strand. An Alert must be a must-clear queue item, and this one would be a must-clear item for a condition nobody is harmed by. What replaced it is the terminal abandoned state above — machinery, not a queue item.

**The count exists for two reasons and both are informational.** The **zero-row catch**: a cheerful empty 200 makes a typo'd or stale Report code indistinguishable from "no cases this period", and one silent member of a ten-code family vanishes inside an otherwise plausible Extract. This is the only reason the Probe stays pre-Decision rather than folding into the job after approval — folding it in would spend nothing on rejected Requests, but a Requester would then wait hours to be told their codes matched nothing. And **accountability**: a rejected or expired Request spends real upstream calls, and the approval gate makes the reject path common. Without `probe_performed` that traffic exists in no record anywhere.

**On the review screen the count is a single summed number**, or "pending", or "failed". The per-code breakdown lives on the event and is deliberately not the headline — ten numbers on a screen read as something to judge, and the sum is the whole informational signal.

Events: `probe_performed` (`system`) carrying the Report codes probed, calls made, the probed span, per-code and total `total_items`, and the upstream `x-request-id`s. `probe_failed` (`system`) carrying the code, the relay of upstream errors and their `x-request-id`s — terminal for the Probe.

## Acceptance criteria

- [ ] Submit returns immediately and the queue item appears with the count pending; the Probe runs off the submit path
- [ ] The Probe makes exactly one `page_size=20` call per Report code in the group, over the Request's whole span
- [ ] The Probe's date range comes from the shared span builder and the Probe contains no date arithmetic of its own
- [ ] The review screen renders the count as a single summed number, or "pending", or "failed"
- [ ] Approve is fully usable in all three states, and no code path blocks or defers a Decision on the count
- [ ] A code exhausting its 3 attempts abandons the whole Probe, writes `probe_failed`, and leaves the count displaying "failed"
- [ ] No Alert of any kind is raised for a stalled or abandoned Probe
- [ ] `probe_performed` carries per-code and total `total_items`, the probed span, the call count and every `x-request-id`
- [ ] A rejected or expired Request still has its upstream traffic on the record via `probe_performed` or `probe_failed`
- [ ] The per-code breakdown is on the event, not the headline of the review screen

## Blocked by

- #65 — The Reviewer queue and review screen
- #67 — The upstream boundary: fake harness, span builder and API client
- #85 — Validate configuration at boot through ConfigModule



## Comments

**rawinan-soma** — 2026-09-17

Reopening: the implementation was discarded. The branch carrying this work (ticket#70) and its PR were deleted, so nothing on any branch satisfies this ticket. Back to ready-for-agent.

Merged in #108 (3d1ace26a09cac6a388fdc87cdf7566d76036510).
