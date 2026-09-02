# 8. The extraction pipeline is sized for one page

Date: 2026-09-02

## Status

Accepted. Rewrites §7.2, §7.6, §7.8, §7.9 and §13.3; amends §5.3, §5.4, §7.5,
§8.1, §10.2, §12.3, §12.4, §13.5, §13.6, §14.3 and §17.1. Amends #8 (the
extraction job architecture) and #5 (queue admission). Follows
[ADR 0007](0007-the-reviewers-gate-is-identity-not-size.md) and #33. Decided on
#34.

## Context

The extraction pipeline was designed in #8 against Report code `02` — acute
diarrhoea, **1,141,658 rows a year, 115 pages** — and against the ~50-page
`OFFSET` cliff #4 measured, past which upstream returns `504`. A full-year `02`
extract was *"not slow, impossible by page-walking"*. Monthly date-chunking was
the answer: hold every page shallow, and a job that could not otherwise complete
completes.

#33 then established that **`02` is not in this service's domain.** The same
upstream endpoint serves the general D506 notifiable-disease block, and this
service serves the 25 EnvOcc Report codes the repo owner classified in
`docs/disease-groups.md`, and nothing else. Probing all 25 live gave the real
figures:

- **The entire in-scope domain is 3,861 rows a year.**
- **The largest Request anyone can express is 1,952 rows** — a full-year national
  `air-pollution` Extract, returned in **one** `page_size=10000` call.
- Every Disease group's whole year fits in a single page.

#33 deliberately re-anchored every *number* and left every *mechanism* standing,
on the ground that re-sizing is not re-designing. That left a pipeline whose
machinery guarded a cliff 50× beyond anything reachable — and whose chunking had
become the dominant cost in the system: monthly tiling turned `pesticides`, a
ten-code group holding **28 rows a year**, into **120 upstream calls**.

Two arguments were made for keeping it anyway, and both failed.

**"Chunking is load-bearing for boundary agreement."** §5.4 built the Probe's
date range from the extraction job's own chunk builder, so the two could never
disagree about which days they covered — the failure that once lost 3,196 rows.
This is true of the code as written but not of the requirement: the Probe reads
only `chunks[0].start` and `chunks[last].end`, which are the Request's own
endpoints regardless of how the span is tiled. **The union of chunks is invariant
to the splitting policy.** Boundary agreement needs a shared *span*, not a shared
*tiling*.

**"Upstream volumes are not ours to hold still."** Codes `216`–`224` and `501` did
arrive by ministerial announcement. But a Report code cannot reach this service
until it is placed in a group in `docs/disease-groups.md` — a reviewed, versioned,
human act (§4.9). Growth does not arrive silently; it arrives at a moment someone
is already looking. What the classification does not bound is row growth inside a
code already in a group, and that would take a **256×** increase before the cliff
mattered.

## Decision

**The pipeline is sized for one page, and says so.**

**Fetch is one upstream call per Report code, over the Request's whole span**, at
`page_size=10000`. The 365-day cap on a Request (§4.2) matches upstream's own, so
the span is always one legal call. Date-chunking is removed.

**A shared span builder** — one function turning a Request into the half-open
`[from, to + 1 day)` — is called by both the Probe and the extraction job. This
is what now holds boundary agreement, and the half-open conversion exists in that
function and the API client and nowhere else.

**The disk pre-check becomes a fixed 1 GB free-space floor**, not a projection
from the Probe's row count. It therefore gates nothing on the Probe: an approved
job starts immediately.

**The drain projection is removed** (§13.3). ADR 0007 already forbade the
Reviewer from acting on size; the Reviewer sees queue position instead.

**Stall detection drops from 15 minutes to 2**, against a worst case of ~35
seconds.

**What survives, survives on correctness and not on load**: the pagination loop
(the right way to read a paged endpoint, which happens to run once today), the
per-code completeness assert, the 3-attempt retry with `total_items` re-check,
and N=1 concurrency because upstream serializes.

**If a Report code ever exceeds ~50 pages, the job fails loudly.** The remedy is a
human act against the classification, not machinery that absorbs it silently.

## Consequences

**The worst case falls from ~7 minutes to ~35 seconds.** `pesticides` goes from
120 calls to 10; `air-pollution` from 12 to 1. Upstream traffic — the thing whose
real risk is *"DDC noticing and revoking our token"* (§5.5) — drops by an order of
magnitude.

**A whole family of second-order machinery goes with it.** The Probe no longer
gates the job, so §5.4's queue wait disappears; `probe_failed` becomes purely
informational, costing only the zero-row catch. §13.3 shrinks to a paragraph
saying there is no admission control.

**Accepted: a code that outgrows the cliff kills its group's Requests until a
human splits it.** Adaptive tiling would have absorbed this. It was rejected as
machinery built for a 256× event, tested by nobody, and standing where a later
reader would read it as evidence of a load that has never existed. The failure is
loud, rare, and actionable; that is the trade.

**Accepted: the pipeline is now honest about being small, which makes it look
underbuilt.** A reader arriving at §7 will see one call per code and may assume
something was forgotten. §5.3, §7.2 and the closing note therefore state the
sizing explicitly and forbid reintroducing chunking without new measurements.

**Unchanged: oversized Requests are never refused.** There was never a size gate,
and there is now no volume gate anywhere for it to be the exception to.
