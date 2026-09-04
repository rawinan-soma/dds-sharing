# 6. A Disease group is a locally-classified family of report codes

Date: 2026-09-02

## Status

Accepted. Amends #7 (the Request parameter surface), #2/#14 (the
de-identification allowlist) and #8 (the extraction job architecture). Decided
on #30.

## Context

Upstream has 25 report codes today — `201`–`224` plus `501` (Heat Stroke,
โรคลมแดด) — each mapping 1:1 to a primary ICD-10 code (#3). The set is neither
contiguous nor closed. The Request surface bound **Disease group** to exactly one of them
(§4.1), and #7 read *one group* as *one upstream call shape* without ever asking
whether one code is the unit the audience thinks in.

It is not. A DDC officer asking for silicosis means `202` (โรคฝุ่นจับปอดจากฝุ่นอื่นที่มีซิลิกา)
**and** `203` (โรคฝุ่นจับปอดร่วมกับวัณโรค). Under the old surface that is two Requests,
two Reviewer Decisions for one judgement, and two Extracts the Requester staples
together by hand — after which the rows cannot be told apart at all, because
`epidem_report_group_code` was dropped from the allowlist as *redundant* (§6.5),
a word that was only ever true while one Request meant one code.

#3 saw the shape and filed it as presentation advice: 201–224 is not a usable
flat dropdown, group by disease family first. The finding was larger than the
dropdown.

## Decision

**A Disease group is a named family of one or more Report codes.** The Requester
picks exactly one Disease group — the cardinality on the parameter surface is
unchanged — and never sees a Report code. The service expands the group to its
codes, fetches each over the same date chunks, and stacks the results into one
Extract.

**The classification is ours, and it is a partition.** No upstream lookup
endpoint exists (#3), so the taxonomy is authored by DDC's own officers over every
Report code: each in exactly one group, none unreachable, a group of one
where a code belongs alone. A code in no group is data nobody can ask for and
nobody can notice is missing; a code in two makes *which Extract did this case
land in* unanswerable.

This is an editorial act inside a de-identified release — a Requester asking for
ซิลิโคสิส receives **our** definition of silicosis. It is therefore published in
the Data dictionary that ships in every Extract archive, never held only as a
lookup table in code, and it is versioned: 216–224 were added by announcement in
ธ.ค. 2567 and the list is amendable again.

**The merge is a plain union.** No ICD-10 filter narrows it — a filter would put
the service in the business of deciding what counts as the disease, and a row
dropped by our predicate is indistinguishable from a case never reported.
`diagnosis_icd10` already rides on every row for anyone who wants to narrow
afterwards. No de-duplication either: one case carries exactly one report code,
so the union is disjoint by construction.

The alternatives were put and declined:

- **Leave it at one code, and group only the picker** — honest, and the status
  quo. Declined because it pushes the merge onto the Requester with no column to
  merge on, and doubles the Reviewer's work for one human judgement.
- **Free multi-select over the 24 codes** — turns the form into a query builder
  and destroys the Reviewer's single legible ask. The Reviewer approves *"one
  disease group, one date range, one area"*; they cannot judge an arbitrary set.

## Consequences

- **`epidem_report_group_code` returns to the Extract** — 22 columns become 23,
  as column 2. An allowlist change reviewed as one (rule 1), not a pipeline
  change. It adds no disclosure — it is the code the Requester already asked
  for — and without it the merged Extract is silently lossy. §18's limitation
  *"a Requester cannot recover which disease group a row came from"* is thereby
  retired.
- **The stored Request carries the expansion, and the expansion is
  authoritative.** Both the family name and the code list resolved at submit are
  stored, following the Area selection's precedent of expanding a health region
  into provinces *before* storing. The taxonomy is amendable, and a Re-run months
  later must refetch exactly the codes the first run fetched. The Decision
  Snapshot shows the Reviewer the family name — that is what they judged — with
  the expansion beneath it.
- **The extraction pipeline's atomic unit becomes the (report code, chunk)
  pair.** Retry, the completeness assert and stall detection all key on it. The
  record needs no change: `chunk_fetched` already carries the exact `group_code`
  it fetched.
- **Row order is report-code-major, then chunk order** — fetch order exactly.
  The Extract fingerprint is a hash of the bytes as written (ADR 0005) and must
  be reproducible; any date-interleaved order means sorting a million rows that
  arrive already grouped.
- **The Probe leaves the synchronous submit path.** One call per date-chunk
  becomes codes × chunks, and a ten-code family over a year would leave a
  Requester on a spinner for minutes. The queue item now appears immediately with
  its row count pending, **approve is blocked until the count lands**, and a
  Probe that never completes raises an Alert. Two things follow: §4.2's reason
  for refusing to split a >365-day Request server-side — *"the Probe runs
  synchronously at submit"* — no longer holds, though the cap itself stands
  because upstream enforces it; and the Probe no longer catches the zero-row
  Request at submit, only on the queue.
- **No runtime width cap.** A Request is never rejected for spanning too many
  codes: the Requester picked a disease and a date range, and a rejection they
  can only satisfy by shortening the dates is a bad conversation. If a family is
  too wide to serve, that is the classification's problem to solve at design
  time — the pesticide block, ten codes differing only by location, is the one
  candidate.
