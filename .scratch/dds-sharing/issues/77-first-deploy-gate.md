# First-deploy gate

Status: ready-for-agent
Blocked by: 74, 75, 76
Source: https://github.com/rawinan-soma/dds-sharing/issues/77 (migrated 2026-09-21)

## What to build

The checks that can only be run once, on the real host behind the real ministry edge, plus the seeded queue that makes the Reviewer surface judgeable.

**The edge is ministry-managed and is not a dependency.** The design was made robust to the worst plausible edge, so no setting on a proxy this project does not administer is a precondition for the system working. The largest archive this service can produce is tens of KB — below any plausible proxy body cap, buffer or timeout. Range-request support and an explicitly configured base URL are retained anyway, both cheap and both still correct.

**The kill switch is `docker compose down` on the VM** — minutes, not the edge team's queue. Removing the *route* is the edge team's and is slower, but is not needed to stop serving data.

**Infra is told what this publishes.** The VM request states that the service is internet-facing and serves case-level (de-identified) DDS surveillance data. A VM granted under "internal tool" assumptions is a mismatch that surfaces at the worst moment, and the person granting it carries part of the residual risk knowingly.

**Requested and verified after the fact — not preconditions**: a public DNS name and a ministry-issued TLS certificate, production only, which is why the base URL is configuration; a route from the edge to the VM's app port and only that port.

⚠️ **An end-to-end download smoke test as a first-deploy gate** — the route, the token and the archive through the real ministry edge, which is the last thing testable since no public route exists before production. **Exercise it deliberately on first deploy rather than discovering it through a Requester.** It is no longer a *large*-download test: at tens of KB there is nothing to stress, and **the gate is about the path existing, not the payload surviving.**

⚠️ **Confirmation, tested from outside, that Postgres, Redis, MinIO and the worker are unreachable. MinIO is the sharp one**: a bucket reachable directly would bypass the Download token and the download audit entirely.

⚠️ **Internal reachability is a separate and larger question than internet reachability.** Being unreachable *through the edge* is automatic; being unreachable from any DDC desktop is not. **Host-level firewalling is required, not just edge routing.**

⚠️ **NTP sync on the Docker host.** TOTP is clock-dependent and there is no email reset path, so **drift beyond ~30 seconds locks out every Reviewer simultaneously**, and the only fix is shell access to the machine that is broken. The ±1-step window absorbs ordinary drift; nothing absorbs an unsynced clock. NTP is doubly required because the business-hours clock and the UTC-stored/ICT-rendered timestamps are unauditable across a drifting clock.

**The province seed migration must run, and its startup assert must be treated as a boot failure, not a warning.**

**The acceptance seed.** Seed the Reviewer queue with a request that is **genuinely hard to judge** — an "independent researcher" on a public-provider address — beside a plainly legitimate DDC officer asking for a full-year national `air-pollution` Extract, which is the largest Request that exists; a สคร. request; a hospital request; and one for `radiation` returning zero rows. **A review screen is only judgeable against a request that is hard to judge.**

## Acceptance criteria

- [ ] An end-to-end download through the real ministry edge succeeds on first deploy, exercising the route, the token and the archive
- [ ] Postgres, Redis, MinIO and the worker are confirmed unreachable from outside, MinIO explicitly among them
- [ ] Host-level firewalling is in place and verified from a DDC desktop, not only through the edge
- [ ] NTP is synced on the Docker host and verified
- [ ] The province seed migration has run and its startup assert is wired as a boot failure
- [ ] The base URL is set from configuration and matches the ministry-issued hostname
- [ ] `docker compose down` on the VM stops the service serving data
- [ ] The Reviewer queue is seeded with the five acceptance requests, the hard-to-judge one among them
- [ ] The DDC infra request on record states that the service is internet-facing and serves case-level de-identified surveillance data

## Blocked by

- #74 — Re-run and resend
- #75 — Observability: health, logs and Bull Board
- #76 — Host CLI commands: Redaction, fingerprint verification and the traffic report

