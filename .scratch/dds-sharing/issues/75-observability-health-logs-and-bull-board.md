# Observability: health, logs and Bull Board

Status: ready-for-agent
Blocked by: 72, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/75 (migrated 2026-09-21)

## What to build

One health document an external checker can watch without a login, a log discipline that keeps case data out of every line, and a job inspector that cannot leak rows to a Reviewer.

**One `/health` document, unauthenticated, with named components: `scheduler`, `extraction`, `disk`, `mail`.** Non-200 if any component is unhealthy, with per-component status in the body. `/health/scheduler` is kept as an alias. One surface is one thing to ask DDC infra to watch — **four paths means three of them never get watched.**

> Stated rather than hidden: an aggregate non-200 cannot distinguish a dead scheduler from a 90%-full disk. Any uptime checker worth configuring reads the body.

> ⚠️ **`/health` is unauthenticated and leaks that this service's disk is filling or its extractions are failing.** Accepted — the alternative is an authenticated health endpoint no external checker can watch, which is the same as not having one. **The document carries statuses only — never counts, never Request data.**

| Component | Unhealthy when |
|---|---|
| `scheduler` | heartbeat stale > 5 min, or an object still present 1 h past token expiry, or an unrecognised province code |
| `extraction` | **two consecutive** extraction failures; a success resets the count |
| `disk` | ≥ 90% used (warn at 75%) |
| `mail` | **two concurrent** send failures |

**Why two, twice:** *one failure is a Requester's problem; two is an outage.* One principle reused verbatim, rather than two invented numbers. **Consecutive, not a rate** — there are too few samples for a windowed rate to mean anything, and if a single failure reddened `/health` the endpoint would be red routinely and would stop meaning anything.

**The disk responder is the service owner with shell access, never a Reviewer.** A Reviewer cannot resize a volume; alerting them would be pure noise on the one screen this design depends on being read. **No eviction policy** — deleting a completed Extract inside its token window would hand the Requester a valid link to a file that is gone, trading a loud failure for a silent one. Size the volume, alarm on the high-water mark, and let the 1 GB refuse-to-start floor be the backpressure. Keep the disk check, and **do not justify it with the extract figure** — the volume also carries PostgreSQL, logs and container images, and ~31 MB of extracts will not fill anything.

**Application logs are kept for 72 hours, then deleted — the same clock as the Extract.** They are operator-facing, they live on the Docker host, and they are **not** part of the audit record: nothing in the record may be reconstructed from them, so deleting them takes nothing the retention promise keeps.

**No case data ever reaches a log line. That ban is the control; the 72-hour lifetime is the backstop behind it.** Concretely: the pipeline stages log counts, Report codes, page numbers and elapsed time — never a row, never a field of a row, and a projection error logs the **row index**. The upstream client logs status, Report code, page number and `meta.total_items` — never a response body, and an error carrying a body is logged with the body **removed, not truncated**, because a truncated body is still case data and it reads as though somebody had thought about it. A BullMQ job payload carries the Request id and nothing fetched, so a failed job sitting in Redis holds no rows.

> **Why the ban and the clock both.** A log line has none of the three things that make the 72-hour rule trustworthy elsewhere — no allowlist deciding what may exist, no destruction rule ending it, no fingerprint recording what left. The matching clock is defence in depth, and **nobody should later read the matching numbers as the reason this is safe.**

> ⚠️ **Accepted cost, recorded so it is not rediscovered: a fault that fires on a Friday has no logs by Monday.** `/health` reddens only after two consecutive extraction failures, and this is a one-operator service. Diagnosis depends on the operator looking inside three days, or on the audit record alone — which holds the fact of a failure but never its cause.

**Bull Board ships, bound to localhost, reached by SSH port-forward from the Docker host.** Not published through the public ingress — it has no auth of its own and would ride the single origin. **Not behind Reviewer auth either, for a sharper reason: a Reviewer's entire job is to never see case data, and putting a raw job inspector on their surface leaves them one unlucky error payload away from it.** It is a debugging tool carrying no watcher obligation — the watching duty sits entirely on `/health` and the Reviewer queue.

## Acceptance criteria

- [ ] `/health` is unauthenticated, returns all four named components with per-component status, and is non-200 when any is unhealthy
- [ ] `/health/scheduler` returns the same document
- [ ] The document carries statuses only — no counts, no Request data, no identifiers
- [ ] `extraction` reddens on two consecutive failures and resets on a success
- [ ] `mail` reddens on two concurrent send failures
- [ ] `disk` warns at 75% and reddens at 90%, measured on the volume rather than on extract size
- [ ] `scheduler` reddens on a stale heartbeat, an object outliving its token by an hour, or an unrecognised province code
- [ ] No eviction policy deletes an Extract inside its token window
- [ ] Application logs are deleted after 72 hours
- [ ] A test asserts no case row or field reaches a log line across the pipeline, the upstream client and the job payload, including on error paths
- [ ] An upstream error body is removed from the log line rather than truncated
- [ ] A projection error logs the row index and never the row
- [ ] Bull Board is bound to localhost, is not reachable through the public ingress, and is not mounted behind Reviewer authentication

## Blocked by

- #72 — The tick: scheduled work, the business-hours clock and object deletion

