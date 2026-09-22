# The extraction pipeline

Status: closed
Blocked by: 66, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/69 (migrated 2026-09-21)

## What to build

Approving a Request releases an extraction job that fetches from upstream, filters to the Request's provinces, and projects the fixed 23-column row set — with completeness asserted per Report code. The job produces rows in memory and reports its outcome on the record; writing the file is the next slice.

**Four stages: fetch → filter → project → write.** Each answers a different question — fetch: *which rows exist upstream*; filter: *which rows*; project: *which columns and what is in them*. Keeping them separate is not tidiness: it is where the derived-column rule lives.

> **Invariant: raw upstream data never lands anywhere.** Each page's rows are projected in memory and appended to that Report code's output before the next page is fetched. Raw responses are never persisted — not to the scratch volume, not to logs, not to the audit table. **Only post-allowlist output ever touches disk.**

**Fetch** — one call per Report code in the Disease group, over the Request's entire span, at `page_size=10000`, using the shared span builder. **Codes are walked in ascending order, and that order is the Extract's row order** — it must not be varied for throughput, of which there is none to gain. The pagination loop stays: walk `while page <= meta.total_pages`. At today's volumes it executes once for every group; that is an observation about the data, never an assumption the code may make. **There is no date-chunking** — monthly tiling was inherited from a design sized against an out-of-scope code and its only surviving effect was cost, turning one group into 120 calls to fetch 28 rows. Adaptive chunk sizing off `total_items` stays rejected: there is nothing to tune. If a Report code ever exceeds ~50 pages over its span, that must **fail loudly** — the remedy is a human act against the classification, not machinery.

**Filter** — a post-fetch row predicate on **`epidem_chw_code`**, prefix comparison, string-normalised, against the Request's stored province list.

> ⚠️ **The filter matches `epidem_chw_code`. It never matches `chw_code`.** Both ship in the Extract and both use the same province codes, so a filter written against the wrong one produces a plausible, well-formed, **silently wrong** Extract that no gate in this system would catch. This is the question a สคร. is asking — *"cases I investigated"*, not *"cases among my registered residents"*.

Upstream sends geography codes and `group_code` as **JSON numbers**, so normalise to string before comparing. No padding is needed: the province domain starts at 10. `epidem_chw_code` is mandatory in DDS reporting, so **count rows where it is absent and raise an operational alert if that count is non-zero** rather than silently dropping them.

**Never read the Report code back out of a response field.** `group_code` does not populate `epidem_report_group_id`, that field is upstream's own grouping and means something else, and the job already knows which code it asked for.

**Project** — owns the fixed 23-column set, the fixed column order, and both derivations. A missing upstream key becomes an empty cell. **The column set is the allowlist, never the observed response keys**: per-group key counts run 56–62 and vary *within* one group by date range, so deriving columns from the response would make the column set a function of the dates the Requester happened to ask for.

The two derived columns: **`onset_age`**, the case's age in completed years at `onset_date` — anchored on the case, never on submission, so two Extracts are comparable and appendable; and **`epidem_health_zone`**, the health region of `epidem_chw_code`. Absent, malformed and impossible inputs all emit an **empty cell** — never a sentinel, never a dropped row, never a clamp to 0. **Impossible values are counted per job and the count goes on the record**: three is bad source data, four hundred thousand means the derivation is broken.

Where `birth_date` is null, `onset_age` is blank **even though upstream ships a populated `age_y`**. Falling back to that field is precisely what the derived-column rule forbids — a derived column may read only fields that are themselves on the allowlist. Re-admitting `age_y` would be an allowlist change, reviewed as one, never a quiet fallback inside the derivation.

**One exception, and it is not a blank**: a null `epidem_chw_code` is a gap in the source, but a code that is **not one of the 77** means our table is stale — that raises the scheduler banner rather than silently blanking a column a regional analyst is about to group by.

**Project also raises the unknown-field alert.** It already compares observed upstream keys against the allowlist; the unknown-*name* check is that same comparison read the other way. An **absent** field is normal and must never alert.

The job reads the province table **once at start and holds it** — not for speed, for consistency. A per-row join would let a mid-job edit put two different regions for one province inside one Extract.

**Completeness** — asserted on rows **received**, per Report code, against that code's `meta.total_items`. Never on rows *written*: the area filter legitimately changes that number. **On mismatch, fail the job and publish nothing.** No partial Extract, no link. Both counts go to the record. A truncated CSV that looks complete is worse than an error — that judgement is why this pipeline exists instead of synchronous streaming.

**Retry, resume and stall.** The Report code is the atomic unit. A failed code retries **from page 1**, 3 attempts, exponential backoff. Each completed code persists on the scratch volume as a checkpoint. **No mid-code resume** — restarting at page 7 assumes the OFFSET window has not shifted, and a partial walk plus a fresh tail is how a quietly-wrong file ships. On retry, the code's `total_items` is compared against the previous attempt; **if it moved, the code is discarded and restarted**. The job fails only when a code exhausts its attempts. **Stall detection, not a duration cap: the job fails if no code completes for 2 minutes** — a stall is killed automatically, never flagged for a human, because a stalled job holds the single upstream slot and blocks every Request behind it.

**Queue mechanics.** BullMQ executes; **PostgreSQL is the system of record**. A job row is written to Postgres at approval and the BullMQ job carries a reference, never authoritative state. **Redis runs with AOF persistence** — a restart on the wrong persistence config drops queued jobs while Postgres still says those Requests exist. **On worker startup, reconcile**: any Postgres job in `queued`/`running` with no live BullMQ job is re-enqueued or failed. **The reconcile never touches `pending`.** **Global extraction concurrency is 1** — configurable, but record why it is 1 so a future operator does not tune it upward expecting throughput.

**A job refuses to start when free disk is below a fixed floor of 1 GB**, writing `job_deferred_low_disk`. It is a floor, **not a projection from the row count** — the volume also carries PostgreSQL, logs and container images, and below 1 GB the right move is to wait loudly rather than run and die at the upload step. **An approved job starts immediately whether or not the Probe's count has landed.**

Events: `job_queued`, `job_deferred_low_disk`, `job_started`, `code_fetched` (one per Report code, carrying exact upstream params, page count, `x-request-id`, rows received vs `total_items`), `job_failed` (cause one of `upstream_5xx` / `auth_expiry` / `completeness_mismatch` / `stall` / `internal`, plus the `x-request-id` — **operator-facing only**), and `job_completed`.

**The Requester is emailed on failure and sees one undifferentiated failure.** They cannot act on "504 on code 214 of the group", and silent death is the worst outcome for this audience. The cause split stays in `job_failed`.

## Acceptance criteria

- [ ] Approving a Request writes a job row to Postgres and enqueues a BullMQ job carrying only a reference
- [ ] Fetch makes one call per Report code over the whole span at `page_size=10000`, walking codes in ascending order, with no date-chunking anywhere
- [ ] No raw upstream response is ever written to the scratch volume, a log, or the audit table
- [ ] Filter predicates on `epidem_chw_code` by prefix with string normalisation, and never on `chw_code`
- [ ] Rows with an absent `epidem_chw_code` are counted and raise an operational alert when the count is non-zero, rather than being silently dropped
- [ ] No code path reads a Report code back out of a response field
- [ ] Project emits exactly the fixed 23 columns in the fixed order, from the allowlist and never from the observed response keys, with a missing key becoming an empty cell
- [ ] `onset_age` is computed at `onset_date`, and is blank — never `age_y`, never a sentinel, never 0 — when it cannot be computed honestly
- [ ] `epidem_health_zone` resolves through the province table, read once at job start and held for the job
- [ ] An `epidem_chw_code` outside the 77 raises the scheduler banner rather than blanking the column
- [ ] Impossible derivation inputs are counted per job and the count reaches the record
- [ ] An unknown upstream field *name* raises the operational alert; an absent field never does
- [ ] Completeness is asserted on rows received per code against `meta.total_items`, and a mismatch fails the job and publishes nothing
- [ ] A failed code retries from page 1, 3 attempts with backoff; there is no mid-code resume
- [ ] A `total_items` that moves between attempts discards and restarts the code
- [ ] The job fails automatically if no code completes for 2 minutes, with no human in the loop
- [ ] Redis runs with AOF persistence, and worker startup reconciles Postgres `queued`/`running` jobs with no live BullMQ job while never touching `pending`
- [ ] Global extraction concurrency is 1, with a config comment recording why
- [ ] A job below the 1 GB free-disk floor defers and writes `job_deferred_low_disk`
- [ ] An approved job starts regardless of whether the Probe count has landed
- [ ] `job_failed` carries its cause and is operator-facing; the Requester's failure email is undifferentiated
- [ ] §17.1's span-builder test is in CI: the Probe and the extraction job, given the same Request, produce byte-identical `start_date` and `end_date`
- [ ] §17.1's completeness test is in CI: a code whose received count disagrees with `total_items` fails the job and publishes nothing
- [ ] §17.1's log test is in CI: a job run against the harness with a sentinel planted in every fetched field never emits the sentinel to a log, exercised on the 500 mid-loop, truncated page and auth-expiry paths

## Blocked by

- #66 — The Decision
- #67 — The upstream boundary: fake harness, span builder and API client
- #85 — Validate configuration at boot through ConfigModule



## Comments

**rawinan-soma** — 2026-09-17

Reopening: the implementation was discarded. The branch carrying this work (ticket#70) and its PR were deleted, so nothing on any branch satisfies this ticket. Back to ready-for-agent.

Merged in #110 (cbd430b9cabe5fddbaede5fa15a884b7833b89d5).
