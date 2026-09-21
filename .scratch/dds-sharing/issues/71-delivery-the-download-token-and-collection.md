# Delivery, the Download token and collection

Status: ready-for-agent
Blocked by: 70, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/71 (migrated 2026-09-21)

## What to build

A completed Extract reaches the Requester as an email carrying a time-limited link. They click it and the archive downloads. After 72 hours, or 10 attempts, the same link shows one sentence saying it has expired.

**Email carries a Download token, never the file.** Size is the obvious reason; the stronger one is that an attachment has no expiry and no revocation, while the whole delivery design rests on a bounded lifetime.

**The Delivery email points at `GET /d/<token>` on NestJS**, not at an Angular route. NestJS counts the Attempt, checks the token, then either streams the archive with range-request support or redirects to the expiry page.

> ⚠️ **`/d/<token>` travels in email, so a live Download token outlives any redeployment that moves it. Treat the path as fixed.**

> ⚠️ **Load-bearing consequence: an Extract stays collectable even if a front-end asset fails to load.** Any design that put collection behind the Angular bundle would let a completed extraction become unreachable inside its 72 hours because of a static asset.

**The token** is unguessable, time-limited and **attempt-capped — not single-use**. Single-use does not defend against the actual threat, a leaked or forwarded link, and makes the outcome worse: whoever opens it first wins, so a leak becomes a lockout of the legitimate Requester *on top of* the disclosure.

- **Expiry: 72 hours from job completion**, never extended by download, never extended by a same-address resend. The clock's job is bounding how long the data sits at rest; anchoring it on anything the Requester observes would make retention hostage to their attention.
- **An Attempt is one presentation, counted at presentation**, not at completed transfer — counting completed transfers would not bind an attacker who aborts at byte 1.
- **Cap: 10 over the whole 72 h, no rolling window.** Deliberately loose. The cap cannot stop a leaked link — one successful download is the entire disclosure — and its only job is bounding how long a link that reached somewhere public stays useful. The number is 10 rather than 3 because counting presentations does bite a legitimate Requester whose transfer drops.
- **Every presentation is audited** — timestamp, IP, user agent, success or failure. *The audit trail is the control; the cap is a backstop.*
- **Failed token lookups throttle per-IP at 20/hour, then a 1-hour block. Successful downloads never throttle** — retrying an interrupted transfer must always work. Every failed lookup is an audit row; **the block is not the useful output, the pattern is.**

**The download endpoint supports range requests** (`Accept-Ranges: bytes`, honouring `Range`), so no single request has to last long and a dropped connection resumes rather than restarting.

**The base URL is explicit configuration, never derived from the `Host` header.** Behind an edge this project does not control, inbound headers are not trustworthy, and the download link is an absolute URL — deriving it from `Host` is how a poisoned link reaches a Requester's inbox.

**`token_lookup` records every presentation, with `request_id` nullable and the token prefix only** — never the full presented token, which would put working credentials in a permanent trail. An unknown token resolves to no Request and so cannot be a child event of one. A *successful* presentation is written to **both** tables, mirrored as `download_attempted`, because accountability asks *"who collected this Extract?"* and abuse asks *"is one IP sweeping the token space?"*, and the second query must not have to filter out the first.

**The expiry page: one page, one sentence, plus the contact telephone number. Always identical.** Four states render it — expired token, exhausted attempts, deleted object, and **a token that never existed**. They are distinguished in the audit record and nowhere else.

> ⚠️ **No reference number on this page.** A token that never existed has no Request and therefore no reference number, and showing the number where we have it would tell someone walking the token space **which guesses landed**. This costs the legitimate Requester nothing — they already hold the reference number.

**No prefill and no resubmit link** in the email or on the page. A "resubmit this Request" link would be a *second* unauthenticated capability, exposing the Requester's own contact fields and outliving the Download token it rides beside. A re-run by the Requester means resubmit and be reviewed again, never *download again*.

**Email configuration** is `SMTP_HOST`, `SMTP_PORT`, `SMTP_STARTTLS=true`, `SMTP_SECURE=false` (explicit STARTTLS on submission, not implicit TLS), `SMTP_USER`, `SMTP_PASS` and `FRONTEND_URL`. Sender identity is the configured address. **Confirm the relay hostname verbatim before it lands in config.** **Mailpit covers development.**

> **The system cannot observe whether an email arrived.** State it in those words. It is a premise, not a footnote — every recipient is outside the ministry's mail domains, and bounces return to a mailbox this application does not own. **An application-owned bounce mailbox was offered and declined**: a new moving part and a new deployment dependency, and it still misses the dominant failure, a message filed silently as junk. **`mail_bounced` must never be added to the event catalogue** — a type that can never be written is a lie in the schema.

**Send failure** is the relay refusing or failing to accept a message — observable within seconds, **our fault**, never the recipient's. Retry 5 times over roughly an hour, each try written as its own event; on the fifth the send is abandoned. The per-kind consequences differ, and the Alerts they raise are the next slice's work — but **the queue-notification kind raises the operator banner on the FIRST failure, not the fifth**. That is the sharpest failure in the system: there is no Reviewer alert available, because the whole point is that no Reviewer is looking at the queue, so a silent queue notification means the approval gate has no trigger and the Request expires through nobody's fault.

> ⚠️ **Two or more concurrent send failures raise the operator banner and the `mail` health component instead of N useless per-Request Alerts.** One failure is a Requester's problem; two at once is an outage.

All four emails — Delivery, Reviewer queue notification, rejection, extraction failure — take their wording from the copy catalogue, not from templates. The rejection email is the sharpest case: its no-reason wording is a decision, and outside the catalogue it changes as a template edit nobody reviews as one.

Events: `mail_sent` (`{kind, to, relay_response}`), `mail_send_failed` (try number, relay error), `mail_send_abandoned`, `download_attempted`, and `object_deleted` when the object goes.

## Acceptance criteria

- [ ] A completed job sends a Delivery email whose link is an absolute URL built from configuration, never from the `Host` header
- [ ] The download path is `/d/<token>` served by NestJS, reachable with the Angular bundle absent or broken
- [ ] The token is unguessable, expires 72 hours from job completion, and is never extended by a download or a same-address resend
- [ ] Every presentation of a token counts as an Attempt at presentation time, capped at 10 over the token's life with no rolling window
- [ ] Each presentation writes a `token_lookup` row with the token prefix only, and a successful one is mirrored as `download_attempted`
- [ ] `token_lookup.request_id` is nullable and an unknown token writes a row with no Request
- [ ] Failed lookups throttle at 20 per IP per hour then block for an hour; successful downloads are never throttled
- [ ] The download endpoint advertises `Accept-Ranges: bytes` and honours `Range`
- [ ] The expiry page renders one identical sentence plus the telephone number for all four states, carries no reference number, and offers no resubmit link or prefill
- [ ] The four states are distinguishable in the audit record and nowhere else
- [ ] SMTP configuration uses explicit STARTTLS on the submission port, and Mailpit serves development
- [ ] All four email kinds take their wording from the copy catalogue
- [ ] A send failure retries 5 times over roughly an hour, each try its own event, then writes `mail_send_abandoned`
- [ ] A failed queue notification raises the operator banner on the first failure
- [ ] Two concurrent send failures raise the operator banner and the `mail` health component rather than per-Request Alerts
- [ ] `mail_bounced` does not exist anywhere in the codebase
- [ ] **All four emails are opened in real clients before this closes**: Gmail web, the Gmail mobile app, Outlook.com and Outlook desktop. Every recipient is on a public mail provider (§11.1), so these four are the realistic set. Check that the layout holds, the download button is a working link, the Thai renders in the intended face or an acceptable fallback, and nothing depends on CSS those clients strip. The design's emails are canvas mockups (screen 9); they have never been rendered by a mail client.

## Blocked by

- #70 — The Extract, the Extract archive and the fingerprint



## Comments

**rawinan-soma** — 2026-09-12

**Design reference:** `docs/design_handoff_dds_sharing/`, landed in fd98274. Read its `README.md` first; the prototype runs.

**Your screens: 5a (Delivery email, approved) and 6 (Collection page).**

Screen 5a renders as an email card: From / To / Sent / Subject header grid over the body. Thai salutation (เรียน), the reference, a bordered spec grid (group, dates, area, file name), a primary **Collect the extract** button, then the 72-hour expiry — *"Opening it does not extend it"* — and a note that the archive holds one CSV plus the Thai/English Data dictionary and must not be forwarded, because the link is the only credential.

Screen 6 carries a faux URL bar making the point this ticket already makes: **the page is served by the API, not the app** (ADR 0003), so an Extract stays collectable even if the front end fails to load. Three mutually exclusive states:

- **Live** — file name, size, time remaining, attempts used of 10, primary **Download the archive**, and *"Every attempt is counted and audited, whether or not the transfer finishes."*
- **Expired** — 72 hours from creation, never extended by use, the file destroyed. Tells them to request again, and to telephone quoting the reference if it expired unfairly.
- **Replaced** — a Re-run produced a newer Extract and retired this link. Points at the most recent email.

The expiry page is deliberately identical whichever of those ended the link (§9.4) — the design's three states are what the *page* renders, not four distinguishable messages to a collector.

Treat it as the source of **visual layout only**; this ticket owns the behaviour. As with #66, the README flags the **email copy as the designer's rather than the spec's** — have the wording owner read 5a.

Do not port `support.js`; the `SIMULATE · SCAFFOLDING` dock is not product; all data is fixtures.

**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: **7** หน้าเก็บไฟล์ (collection), **8** ลิงก์ใช้ไม่ได้ (the expiry page) and **9** อีเมลทั้งสี่ฉบับ (all four emails).

⚠️ **There is no "replaced" collection screen and there must not be one.** §9.4 requires one page, one sentence, identical for all four dead-token causes. The earlier handoff had a distinct *this link was replaced* state; it would tell someone walking the token space which guesses landed.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.

**rawinan-soma** — 2026-09-18

**The collection path changed: ADR 0018.** `GET /d/<token>` no longer streams the archive. It renders a small server-side page (NestJS template, catalogue strings, no Angular bundle, no required script), and the archive is a second request, `GET /d/<token>/archive`, made when a person presses the button.

- **Opening the page is a lookup, not an Attempt.** It writes a `token_lookup` row and counts towards the failed-lookup throttle, but is not mirrored as `download_attempted` and does not touch the cap.
- **The archive request is where §9.2 applies**: count the Attempt at presentation, write both audit rows, stream with `Accept-Ranges: bytes`. Range resumes hit this URL and each counts, as before.
- A dead token redirects to `/link-expired` from either route.

**Why:** mail-security scanners and link previewers open links in incoming mail automatically. With the old route each one spent an Attempt and received the case-level archive before the Requester clicked. Now they receive HTML.

The page is screen 7 (and 7m at 390px) in the design; `docs/design/handoff.md` §7–8 has the spec, and the counter is labelled *ดาวน์โหลดแล้ว*. Spec §9.1, §9.2, §16.2 and SRS FR-19 are amended. The E2E range test now targets `/d/<token>/archive`.
