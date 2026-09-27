# Record every upstream call, so the traffic report is not a floor

Status: ready-for-agent

## What to build

The upstream traffic report (#76, spec §13.6) counts calls from the events the Probe and the extraction job write, and those events miss calls. So the report shows less traffic than was really sent, and it prints that every figure is a floor. The gap is widest exactly when DDC's server struggles and retries pile up, which is when DDC is likeliest to ask.

What the record misses today:

- **Retries that ended in success.** `probe_performed.callsMade` is one per Report code (`requests/probe.service.ts`), although the service already collects every attempt and discards them on success. `code_fetched.pageCount` counts the pages of the attempt that succeeded, not the pages retried.
- **An abandoned Probe's earlier codes.** `probe_failed` relays only the failing code's attempts, not the calls already spent on the codes probed before it.
- **A failed job's fetches.** An extraction that fails partway writes no `code_fetched` for the code it was on, so the pages it walked are never counted.

And one count that may run the other way: an abandoned Probe's calls are counted as its relayed errors, but a local timeout, DNS failure or other error raised before a request left the host is relayed as an error too, and counted as traffic DDC never saw.

Found in the #76 review; kept out of #76 because it changes what #69–#71's events record.

## Acceptance criteria

- [ ] Every upstream call the Probe makes, retries included, is counted on `probe_performed` or `probe_failed`
- [ ] Every upstream call the extraction job makes, retries and a failed job's partial work included, is counted on a request event
- [ ] An error raised before a request reached upstream is not counted as a call
- [ ] The traffic report sums those counts and no longer prints that its figures are a floor

## Comments

**Claude** — 2026-09-27

Triaged with the repo owner: fix fully, rather than keep the report's printed caveat. Checked against the code first: every gap listed above is real.

Decisions taken while building it:

- **A call is an attempt that reached upstream**: answered, or cut off while in flight, by the 60 s timeout or by a stall. It is not an attempt the network refused (DNS failure, refused connection). A 60 s timeout is taken as having reached upstream because the connect phase fails on its own, well inside 60 s, as a network error. `UpstreamClient` reports each one through a new `onCall` hook, and the tests hold the count against the fake upstream's own request log.
- **Where the counts live**: `callsMade` on `probe_performed`, `probe_failed` (the whole Probe's, earlier codes included), `code_fetched` (every page of every attempt; `pageCount` still means the pages of the walk that succeeded) and `job_failed` (the failing code's calls, which no `code_fetched` carries).
- **A stall now cancels the pipeline.** Before, a stalled pipeline kept calling upstream in the background after `job_failed`, uncounted and beside the next job. The worker now aborts it, gives it up to 5 s to settle, then writes `job_failed` with the calls it made. Spec §7.6 says so.
- **No backfill.** Nothing is deployed yet (#77), so there are no old events without `callsMade` to fall back on.

**Claude** — 2026-09-27

Fixed the findings from `/code-review` on 714137b:

- **A dropped connection is now counted.** A request whose connection the other side dropped after it was sent (`UND_ERR_SOCKET`, `ECONNRESET`, `EPIPE`) reached DDC and is counted. Other network failures still are not.
- **"Exact" is withdrawn from §13.6.** It now states the one remaining error: a stall's cancel landing mid-connect counts a call that never arrived. It errs high, by at most one per stall.
- **A code's calls are cleared only after its `code_fetched` is written**, so a failed write hands them to `job_failed` instead of losing them. The worker now touches the heartbeat before the event write, so nothing after the write can fail and count the calls twice.
- **Report wording:** "spent on Report codes they did not finish", which also covers a job that failed after every code was fetched.
- **Tests:** extraction counts are now checked against the fake upstream's log (a retried page; a failed job with a dropped call). The fake upstream gained `dropped` and `slow-body` faults. New tests cover a timeout after the headers, the stall's settle-timeout branch, and a stall landing mid-write.
- **Standards:** `stallSettleMs` moved into `EXTRACTION_DEFAULTS`. One `CallCount` is shared by the Probe and the pipeline. The timeout-or-cancel check is one helper. The unrecorded count is a required dependency. "Attempt" became "call" in the new prose.

