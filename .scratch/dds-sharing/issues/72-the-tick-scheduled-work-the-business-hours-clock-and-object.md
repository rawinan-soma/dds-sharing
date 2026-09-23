# The tick: scheduled work, the business-hours clock and object deletion

Status: ready-for-agent
Blocked by: 71, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/72 (migrated 2026-09-21)

## What to build

A 60-second pass that finds due work and does it — deleting expired objects, detecting stalls, materialising `expired`, retrying due sends, tripping collection-lapse wires and pruning operational tables. It writes a heartbeat, and when it stops, both a Reviewer and an external checker are told.

**`@nestjs/schedule` every 60 s, querying Postgres for due work and enqueueing real BullMQ jobs to do it. Redis executes; Postgres is the truth.** BullMQ repeatable jobs were rejected: a schedule living only in Redis is a schedule a Redis loss silently cancels.

**Stateless and disposable.** "Due" is a query, not an event, so a restart needs no catch-up logic — the next pass picks up everything outstanding. **There is no missed-window class of bug.**

**One pass, several queries, one Postgres advisory lock.** The lock is taken each pass, so single execution is *enforced* rather than remembered and the deployment shape stays free — scaling the app container later cannot silently double every deletion. Separate cadences per job were rejected: every job here is "find due work", and four schedules mean four heartbeats and four ways to be half-alive.

**The startup reconcile is the same pass with no lower bound on "due"** — not a separate code path. It touches exactly two things: approved Requests whose extraction was `running` when the process died, re-enqueued because code-atomic retry makes that safe; and expired Download tokens whose objects still exist, deleted. **It never touches `pending`** — an unapproved Request has no work and its clock is derived.

**Expiry is derived, not scheduled.** Both expiry rules are predicates computed at read time: the queue computes elapsed business hours when it renders, and the download endpoint checks the clock on every request. **So a dead scheduler cannot un-expire a Request or keep an Extract reachable.** The tick's remaining work on expiry is *materialising an event row for a fact that is already true* — a late tick produces a late row, not a wrong outcome. Only two jobs genuinely need a timer: physical object deletion, because a file nobody asks for is never noticed; and stall detection, because a stuck job never triggers a read.

**Object deletion at token expiry, and the application owns the record.** A scheduled job deletes the object and writes a deletion record — actor, object key, timestamp, outcome. **A MinIO lifecycle rule is the backstop only**, for when that job is broken or the box was down. A lifecycle rule deletes silently: the application would hold a token row asserting an Extract exists when the object is already gone, and hold no record that the deletion happened. **The evidence is the application's deletion record, not the bucket's configuration.**

> ⚠️ **The bucket lifecycle is also 72 h, so the invariant *lifecycle ≥ token expiry* holds by equality with no slack.** That is safe **only** because S3/MinIO lifecycle expiration is evaluated in whole days on a periodic scan and therefore fires at or after the boundary, never early. **If the rule is ever expressed in a unit finer than days, or measured from anything other than object creation, that guarantee is gone and the rule must go back above the token expiry.** This reasoning belongs next to the number in the config, because "72 and 72" looks like a tidy coincidence.

**An object still present 1 hour past its token expiry is a scheduler-class fault** and raises the banner and the health signal. Never a silent skip.

**The business-hours clock** is Mon–Fri 08:30–16:30 ICT, and only weekends stop it — there is no public-holiday list (ADR 0021, amended 2026-09-23; see Comments). A public holiday counts as a working day: that is the accepted cost, and the clock is fully determined by the instant alone, with nothing to maintain or drift.

**The same clock serves two callers and answers a different question for each.** Request expiry asks it *how much attention time has elapsed*, so business hours are the measurement itself. The collection lapse asks it only *is anyone there to be told?*

> ⚠️ **The collection-lapse trip-wire runs on WALL-CLOCK time — 24 wall-clock hours with zero Attempts — and only the Alert is held for business hours.** Do not re-unify the two uses. Measuring the lapse in business hours is the natural-looking simplification and it is a **defect**: 24 business hours are exactly 72 wall-clock hours on a weekend-free week, so a Monday 09:00 Delivery raised its Alert at the same instant the token expired, and a Friday 15:00 Delivery raised it 48 hours after the Extract had been deleted. Lowering the threshold does not help. **A clock that stops cannot warn you about one that does not.**

A trip-wire firing outside business hours waits for the next opening at 08:30 — an Extract delivered Friday at 16:00 is not a failure on Saturday afternoon, and a queue full of weekend noise is a queue nobody reads. What the Reviewer gets is 48 hours to telephone on a Monday Delivery and 6.5 hours on a Friday-afternoon one. **The higher false-positive rate is accepted deliberately**: a Reviewer sometimes telephones a Requester who was merely slow, and that costs one call, against a completed extraction and an upstream slot.

**`expired_uncollected` is a distinct terminal state.** Without it a Request would end identically whether the Requester collected the Extract or never saw the email — opposite outcomes, one a success and one a wasted extraction. **This is the only number that measures whether email is working.**

**The work on the pass**: object deletion at token expiry · stall detection · materialising `expired` · due mail send-retries · Deliveries past 24 wall-clock hours with zero Attempts · pruning the two deletable tables.

**Every "cleanup" the tick performs on the event tables is expressed as an insert.**

**`DELETE` is correct in exactly one place**: `reviewer_session` and the login-throttle table are operational state, not event tables, and carry no accountability value.

> ⚠️ **The pruning job needs `DELETE` on exactly those two tables and on nothing else.** Draw the role boundary around it, or this becomes the reason the application role gets a broad `DELETE` grant that the whole enforcement argument rests on it not having.

**Liveness: the tick writes a heartbeat row every pass, stale after 5 minutes** — five missed passes, unambiguous. In-band alerting is circular, so one fact feeds two consumers: **a Thai banner on the Reviewer queue**, stating plainly that automatic processing has stopped and what that means for their work — not an error code — and **`/health`**, so DDC infra or any uptime checker can watch it without a login. The banner is the guaranteed reader: the one screen a named, accountable human opens daily. An external dead-man's-switch service was rejected — an outbound internet dependency on a ministry host, and a new vendor in the compliance conversation. **The design deliberately never *requires* email.**

Events: `expired`, `collection_lapse_raised` (carrying the wall-clock hours elapsed, so a trip-wire that fired on time is distinguishable from one whose Alert waited for Monday), `expired_uncollected`, `object_deleted`.

## Acceptance criteria

- [ ] A single 60-second pass takes one Postgres advisory lock and performs every scheduled job; there is no second schedule anywhere
- [ ] The pass is stateless — a restart needs no catch-up logic, and the next pass picks up everything outstanding
- [ ] Startup reconcile is the same pass with no lower bound on "due", touching only running extractions and expired-token objects, and never `pending`
- [ ] Request expiry and token expiry are read-time predicates; stopping the scheduler un-expires nothing and keeps nothing reachable
- [ ] Objects are deleted at token expiry by the application, writing `object_deleted` with actor, object key, timestamp and outcome
- [ ] A MinIO lifecycle rule exists as a backstop, with a config comment recording why the equality of 72 and 72 is safe and what would break it
- [ ] An object still present 1 hour past token expiry raises the banner and the health signal rather than being skipped
- [ ] The business-hours clock counts Mon–Fri 08:30–16:30 ICT and skips weekends only, with no holiday list to go stale (ADR 0021)
- [ ] The collection-lapse trip-wire measures 24 **wall-clock** hours with zero Attempts; only the raising of the Alert waits for business hours
- [ ] `collection_lapse_raised` carries the wall-clock hours elapsed
- [ ] `expired_uncollected` exists as a distinct terminal state, separate from collected
- [ ] Every cleanup on an event table is expressed as an insert
- [ ] Pruning holds `DELETE` on `reviewer_session` and the login-throttle table and on nothing else, with the role boundary drawn around it
- [ ] The tick writes a heartbeat every pass, and staleness past 5 minutes raises both the Thai Reviewer-queue banner and the `scheduler` health component
- [ ] The banner states in plain Thai that automatic processing has stopped and what that means, with no error code
- [ ] No outbound dead-man's-switch dependency exists, and no scheduled job requires email to function

## Blocked by

- #71 — Delivery, the Download token and collection

## Comments

**rawinan-soma** — 2026-09-23
Amended after the clearance on PR 113 failed the original criterion "reads a checked-in holiday config, and a stale list can only widen the window": a stale list omits holidays, which narrows the window, and the checked-in list was already stale. Decision: skip Thai public holidays entirely and let only weekends stop the clock. Recorded in ADR 0021, which lists every section amended (spec §11.4, §15.2, §17.3, §18.14; the SRS; the charter).
