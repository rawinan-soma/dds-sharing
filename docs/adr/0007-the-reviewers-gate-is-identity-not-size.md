# 7. The Reviewer's gate is about identity, not size

Date: 2026-09-02

## Status

Accepted. Reverses a stated rationale in §5.4 and removes a requirement from
§10.2 and an Alert from §10.6. Amends #5 (the Probe), #8 (the extraction job
architecture) and #30 / [ADR 0006](0006-a-disease-group-is-a-family-of-report-codes.md).
Decided on #31.

## Context

The Probe exists to read exact `meta.total_items` before a Request is extracted.
§5.4 justified it, in part, with a claim about the Reviewer:

> Its row count is shown to the Reviewer, who is judging proportionality. "This
> person is asking for 1.14 M rows" is precisely the signal a human gate exists
> to catch.

From that claim followed a requirement — **approve is disabled until the count
lands** (§10.2) — and from that requirement followed a fourth Alert type, **Probe
stalled** (§10.6), whose own stated reason was that a wedged Probe "leaves a real
person waiting behind a screen nobody is looking at."

Two things then made the Probe expensive. [ADR 0006](0006-a-disease-group-is-a-family-of-report-codes.md)
made a Disease group a family of up to ten Report codes, and §5.4 made the Probe
one call per (Report code, date-chunk) pair. A full-year Request in the widest
group — `โรคจากสารกำจัดศัตรูพืช`, ten codes — therefore cost ~130 calls at ~3.5 s each:
**~7.6 minutes holding the single upstream slot** (§13.2), queued ahead of every
extraction job, and spent as often on Requests that are rejected as on ones that
run.

Investigating that cost surfaced the larger error. The repo owner ruled that
**the row count is not a ground for rejection**: a Request that needs hours to
extract completes in hours; long runtime is not a reason to refuse it. The
specification had half-admitted this already — §13.3 downgraded the drain
projection from a hard refusal to advisory precisely because two gates
disagreeing is worse than either — and the map had ruled mechanical identity
verification out of scope on the grounds that the check is human judgement about
a person. §5.4's proportionality claim was the last place the opposite idea
survived.

## Decision

**The Reviewer's gate is about who is asking — identity, Workplace, legitimacy —
not about how much they ask for.** Size never grounds a Decision.

Four consequences:

1. **The Probe makes one call per Report code over the Request's whole span**, not
   one per (Report code, chunk) pair. A Request's span is capped at 365 days and
   upstream's cap is 365 days, so the whole span is always one legal call. The
   widest group's full-year Request goes from ~130 calls / ~7.6 min to **10 calls
   / ~35 s** for the identical number. The only thing per-chunk probing bought —
   a submit-time check that no month exceeds the ~50-page cliff — is already
   ruled by §7.2 to fail loudly at run time.

2. **Approve is no longer blocked on the count.** The count appears on the queue
   item as information, summed; the per-code breakdown lives on
   `probe_performed`.

3. **The Probe stalled Alert is removed.** It existed only to rescue a Request
   that could not be approved. Nothing is stranded now.

4. **The Probe's date range is built by the extraction job's own chunk builder.**
   Under per-pair probing the Probe and the run could not disagree about which
   days they covered; one call over the span is a second expression of the same
   range, and §7.2 records that two expressions of one range is how the 3,196-row
   loss happened. The Probe-vs-run difference is recorded on `job_completed` and
   **never asserted** — real drift is expected, because hours to days pass
   between them and upstream keeps receiving reports for past dates.

The Probe stays **pre-Decision** rather than folding into the job after approval.
Folding it in would spend nothing on rejected Requests, but it would lose the
zero-row catch at the only moment it helps: §5.2's cheerful-empty-`200` makes a
stale Report code indistinguishable from "no cases this period", and a Requester
should not wait hours to be told their codes matched nothing. At 10 calls the
reject-path waste is trivial.

One thing still waits on the Probe: **an approved job does not start until the
count lands**, because §7.8's disk pre-check has no other input. That is a gate
on the job, never on the human.

## Consequences

**Good.** 13× less upstream traffic on every Request, most visibly on the reject
path, against a global concurrency budget of 1. The Reviewer decides when they
are ready rather than when a background call finishes. One fewer Alert type in a
must-clear queue, and one fewer state a two-person team has to service.

**Bad.** No submit-time warning that a single month may exceed the ~50-page
cliff; that failure now surfaces only at run time, loudly, as §7.2 requires. The
drain projection loses exactness — it uses the lower bound
`max(chunks, ceil(total / 10000))` per code, which is within ~4% on the only
volume that matters and exact on low-volume codes. The Decision Snapshot may
record a `pending` count, so an auditor reading a Decision years later may find
the Reviewer decided without knowing the size; that is now the correct reading,
not a gap.

**Watch for.** Both removals read as bugs to a competent implementer. "Approve is
enabled while the count is pending" and "the Probe can wedge with no Alert" will
both look like something to fix; §5.4 and §10.6 carry explicit *do not fix this*
warnings for that reason.
