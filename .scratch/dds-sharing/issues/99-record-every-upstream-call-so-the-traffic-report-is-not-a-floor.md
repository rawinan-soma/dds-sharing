# Record every upstream call, so the traffic report is not a floor

Status: needs-triage

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
