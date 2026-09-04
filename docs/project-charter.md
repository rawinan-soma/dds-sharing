# PROJECT CHARTER (กฎบัตรโครงการ)

> **Drafting note.** Written in English so it can be produced and reviewed against
> [`spec.md`](spec.md) directly; **the delivered document is Thai** and the
> translation is the project manager's. Field labels are carried in the form's own
> bilingual wording so the mapping back to the workshop template is mechanical.
>
> **Re-anchored 2026-09-04 against [`spec.md`](spec.md) v1.2**, closing OQ-06 of
> [`docs/srs.md`](srs.md). The v1.0 figures this charter carried — **22 columns**,
> a full-year group `02` worst case of **1,141,658 rows in 10–25 minutes**, a
> **~20–30 MB** archive, and **date-chunking as *"mandatory for correctness"*** —
> were superseded by [#30](https://github.com/rawinan-soma/dds-sharing/issues/30),
> [#33](https://github.com/rawinan-soma/dds-sharing/issues/33) and
> [#34](https://github.com/rawinan-soma/dds-sharing/issues/34), and are corrected
> throughout. ⚠️ **Every correction makes the engineering problem smaller, not
> larger.** Where a withdrawn figure was carrying weight in the business case, the
> replacement states what the real difficulty is rather than quietly dropping the
> old claim — a sponsor who was shown the old numbers should be able to see what
> changed.
>
> Every substantive claim below traces to [`spec.md`](spec.md) **v1.2
> (2026-09-04)**, to [`docs/srs.md`](srs.md) **v1.2**, to
> [`CONTEXT.md`](../CONTEXT.md), or to a closed ticket on
> [Map: DDS surveillance data-sharing service](https://github.com/rawinan-soma/dds-sharing/issues/1).
> Section references in this charter (§n) are `spec.md` sections.
>
> `TBD` marks a value the project manager must supply. Nothing here is invented to
> fill a blank.

---

## GENERAL PROJECT INFORMATION (รายละเอียดโครงการทั่วไป)

| Field | Value |
|---|---|
| **PROJECT NAME** (ชื่อโครงการ) | **DDS-ENVOCC-Sharing** |
| **PROJECT MANAGER** (ชื่อผู้จัดการ) | Rawinan Soma |
| **PROJECT SPONSOR** (ชื่อผู้อุปถัมภ์) | Director, EnvOcc — `TBD: name and full title` |
| **EMAIL** (อีเมล์) | rawinan.soma@gmail.com |
| **PHONE** (เบอร์โทร) | `TBD` |
| **ORGANIZATIONAL UNIT** (หน่วยงานหลัก) | กองโรคจากการประกอบอาชีพและสิ่งแวดล้อม (EnvOcc), กรมควบคุมโรค (DDC) |

| Field | Value |
|---|---|
| **ESTIMATED COSTS** (ประมาณการต้นทุน) | **No cash budget.** Internal staff time only; existing DDC infrastructure. See COSTS below. |
| **EXPECTED SAVINGS** (ความคาดหวังในการลดต้นทุน) | `TBD` — see BENEFITS. Requires the current manual-handling baseline (requests/year × staff-hours/request), which is not yet on record. |
| **EXPECTED START DATE** (วันเริ่มโครงการ) | September 2026 |
| **EXPECTED COMPLETION** (วันสิ้นสุดโครงการ) | November 2026 |

---

## PROJECT OVERVIEW (ภาพรวมโครงการ)

### PROBLEM OR ISSUE (ปัญหา หรือประเด็นที่พบ)

Officers at DDC and the regional offices (สคร.) need **case-level DDS
occupational- and environmental-disease surveillance data** to do their work.
Today there is no route to it that is at once usable, safe and accountable.

Four problems, each independent of the others:

1. **The request process is manual and undocumented.** Two administrators handle
   requests by hand. There is **no record of who released what to whom**, so a
   release cannot be traced after the fact and no named person is accountable for
   any individual release.
2. **De-identification is done by hand, or not at all.** The upstream record
   carries names, national ID, telephone, passport number, address, village,
   sub-district (ตำบล), point coordinates and free text. Removing these correctly
   and *identically every time* is not something a manual process can guarantee.
3. **The upstream API cannot be used naively.** Measured (§5.3): a ~3.5 s fixed
   cost per request independent of rows returned; `OFFSET` pagination with a
   **~60 s gateway timeout** past roughly 50 pages; an **unknown `group_code`
   returns `200` with an empty array** rather than an error, so a mistyped code
   is indistinguishable from *"no cases this period"*; and there is **no
   field-projection parameter**, so every response carries the plaintext
   identifiers whether they are wanted or not.
   > ⚠️ **Volume is not the difficulty, and an earlier version of this charter
   > said it was.** The out-of-scope Report code `02` was cited here at 1,141,658
   > rows; **the whole in-scope domain is 3,861 rows a year** and the largest
   > single Extract is **1,952 rows — one page** (§5.3, ADR 0008). The real
   > difficulty is **correctness across calls**: a Disease group is up to **ten
   > Report codes**, so one ask is up to ten separate calls that must share one
   > date range, each be reconciled against `total_items`, and be de-identified
   > identically every time.
4. **There is a real disclosure risk if this is done casually.** DDS EnvOcc data
   is health data about identifiable people. A careless extract is a disclosure
   that cannot be recalled.

### PURPOSE OF PROJECT (วัตถุประสงค์ของโครงการ)

Build a web application that lets an officer ask for a **de-identified,
case-level extract** of Thai DDC **DDS** EnvOcc surveillance data, where:

- **every Request is read and decided by a named human before any data is
  fetched** — the approval gate;
- **de-identification is a strict allowlist enforced in code** — 23 columns, never
  a judgement call;
- **surveillance data is never stored at rest** — fetched live, projected in
  memory, written only after de-identification;
- the Extract is delivered as **one zipped CSV through a time-limited link in an
  email, and destroyed 72 hours later**;
- **the release is recorded permanently** so it can be audited.

Audience: officers at DDC and สคร., on ordinary internet connections,
reading Thai, analysing in Excel, R or Python.

### BUSINESS CASE (ประโยชน์ทางธุรกิจ)

#### The surveillance scheme this serves

**DDS is DDC's digital disease surveillance scheme** — ระบบเฝ้าระวังโรคดิจิทัล.
EnvOcc's part of it carries **25 disease report codes**, each mapping 1:1 to an
ICD-10 code: `201`–`224` — **15 established under พ.ร.บ.ควบคุมโรคจากการประกอบอาชีพ
และโรคสิ่งแวดล้อม พ.ศ. 2562** and **9 added to DDS from ธ.ค. 2567** — **plus `501`
(Heat Stroke, โรคลมแดด)**. The set is amendable by announcement and is **not
contiguous**. Those 25 are grouped into the **ten Disease groups** a Requester
chooses from, a classification made by DDC's own officers rather than received
from upstream ([ADR 0006](adr/0006-a-disease-group-is-a-family-of-report-codes.md)).

What the scheme watches, in its own categories: pneumoconioses and
asbestos-related disease (`202`–`206`), mesothelioma (`207`), lead toxicity
(`208`), air-pollution exposure (`201`), low-oxygen environments (`219`),
ionizing-radiation exposure (`222`–`224`), and a **block of ten
pesticide-poisoning codes (`209`–`218`) distinguished by nothing except where
the poisoning happened** — home, dormitory, school, sports field, road,
commercial area, industrial site, farmland, other, unspecified.

> **That last block is the shape of the whole scheme in miniature.** Ten codes
> that differ only by location exist because **the intervention differs by
> location.** Pesticide poisoning on farmland is an agricultural-extension and
> licensing problem; the same poisoning in a dormitory is a housing and employer
> problem; in a school it is a child-safety problem. The scheme is built to
> answer *where*, because *where* is what the department can act on.

#### How the data is used

Surveillance is a cycle — **report → collect → analyse → act → evaluate** — and
the data earns its keep only in the last three steps.

| Use | What it needs from the data |
|---|---|
| **Situation assessment** — how much EnvOcc disease is occurring, where, and in whom | Case counts cross-tabulated by disease group × area × time, at a granularity the analyst chooses after seeing the data, not before |
| **Trend and signal detection** — is silicosis rising in this province, is a pesticide cluster forming in this district | A consistent line list over a long enough span that a change is distinguishable from reporting noise |
| **Targeting interventions** — which employers, which districts, which crops or industries | The location and occupational coding, at district level, joined to the disease code |
| **Programme evaluation** — is the พ.ร.บ. 2562 scheme detecting what it was written to detect; did the 9 codes added in ธ.ค. 2567 change what is seen | Comparable extracts across periods, reproducible so two analysts get the same file |
| **Regional (สคร.) operational work** — investigating and responding in one's own area | Filtering to one's own area, on demand, without asking Bangkok |
| **Reporting upward** — to the division, the department, and statutory reporting under the พ.ร.บ. | Figures that can be traced back to the extract they came from |

**Why case-level, and not an aggregate table.** Every use above is a
cross-tabulation the analyst does not know in advance. A pre-aggregated report
answers the question it was designed for and no other; a **line list — one row
per reported event, 23 columns — answers the question that has not been asked
yet.** This is why the service ships a case-level Extract and why officers
analyse it in Excel, R or Python rather than reading a dashboard.

**Why de-identified.** None of these uses needs to know *who* the person is.
They need the disease, the place, the time and the coded demographics. **The
analytic value of this data survives de-identification almost entirely — that is
the fact the whole design rests on.**

#### Where the scheme already works, and where it stops

**Reporting *into* DDS is solved.** Four documented submission paths exist — the
HIS API (HosXP, HosMy, HosPCU, JHCIS), the Semi-Offline Excel batch API, key-in
at the DDS Portal, and other-vendor APIs coordinated with กองระบาดวิทยา. Data
flows HIS → API → DDS collection / Data Hub → analytics.

**Getting case-level data back *out*, to the officers whose job is to analyse
it, is not solved.** Every documented path into the upstream system is MoPH
account / Provider ID RBAC, scoped to a reporting unit rather than to an
analytic question, and there is no de-identified case-level extract route at all.
So the analytic step of the cycle runs on **ad-hoc manual requests handled by two
administrators, with no record of what was released to whom.**

**The scheme's collection arm is instrumented and its analysis arm is not.** That
asymmetry is what this project addresses.

#### What this system supports

| Contribution to the scheme | How |
|---|---|
| **Closes the analysis arm of the surveillance cycle** | A standing, self-service route to case-level EnvOcc surveillance data, replacing an ad-hoc favour with a predictable ≤24-business-hour turnaround |
| **Serves the *where* question the scheme is built around** | Area filter to district (อำเภอ), on the address recorded during case investigation — answering *"cases I investigated"*, not *"cases treated near me"* (§4.4) |
| **Makes the analysis reproducible** | The same rows written twice produce one fingerprint (§8.4), so a figure in a report can be traced to the exact extract behind it |
| **Makes releases accountable, which they are not today** | Every release carries a named Reviewer, a recorded Decision and a Snapshot of what was approved — the single largest gap in the current process |
| **Makes de-identification a control that cannot drift** | A strict 23-column allowlist in code (§6). A field reaches the Extract only by being on the list; an unknown upstream field raises an alert rather than passing through |
| **Makes the multi-call ask reliable** | A Disease group is up to **ten Report codes**, so one ask is up to ten upstream calls that must share one date range and each be reconciled against `total_items`. Retry, resume and the completeness assert are built **once** here (§7) instead of being re-improvised, differently, by every officer |
| **Returns administrator time to judgement** | The two administrators stop assembling extracts by hand and spend minutes per Request on what the gate exists for — is this person who they say they are, and is this ask proportionate? |
| **Extends the scheme's reach to สคร.** | Regional officers work from ordinary internet connections, so the service is internet-facing by design (§3.1) rather than locked to the DDC network |

> **What this project is not.** It does not change what is reported, add a
> surveillance code, or alter the พ.ร.บ. scheme in any way. It is **retrieval
> infrastructure for a scheme that already exists** — the missing return path in a
> cycle whose outbound half is already built.

### GOALS / METRICS (เป้าหมาย / ตัวชี้วัด)

Grouped by what each one buys **the surveillance scheme**, not by what it buys
the software. Every target below is verifiable on the built system.

#### A. The analysis arm of the cycle actually runs

*Surveillance data that cannot be got hold of has no surveillance value.*

| Metric | Target | Spec |
|---|---|---|
| Requests reaching a terminal state within **24 business hours** | **100%** | §2, §10 |
| Worst case a Requester can express — a full-year national `air-pollution` Extract, **1,952 rows** | **completes in ~3.5 s** | §5.3, §7.9 |
| Widest Disease group by calls — `pesticides`, **10 Report codes**, 28 rows | **completes in ~35 s** | §5.3, §7.9 |
| Requests refused for being too large | **0** — there is no size gate | §7.9 |
| Extraction failures that leave the Requester uninformed | **0** — every failure emails the Requester and raises an Alert | §14.3 |

#### B. The Extract fits the surveillance questions it exists to answer

*A line list that cannot be trusted or cannot be reproduced cannot support a
statutory report.*

| Metric | Target | Why it matters to the scheme |
|---|---|---|
| Columns in the Extract | **exactly 23** (21 passthrough + 2 derived) | The analysable surface: disease code, coded demographics, clinical dates, reporting facility, area (§6.2) |
| Finest area granularity available to the analyst | **district (อำเภอ)** | The *where* the scheme is built to answer — the ten pesticide codes differ by nothing else (§6.1) |
| Report codes published with `received ≠ total_items` | **0** — the job fails and publishes nothing | **A line list with silent gaps is worse than no line list**: a trend computed on it is wrong and looks right (§7.5) |
| Same rows written twice ⇒ one fingerprint | **byte-identical** | A figure in a report can be traced to the exact extract behind it (§8.4, §17.1) |
| Area filter basis | **the address recorded during case investigation** | Answers *"cases I investigated"*, not *"cases treated near me"* — the สคร. question (§4.4) |

#### C. The scheme's duty of care to the people in the data holds

*The scheme's licence to collect this data at all depends on what happens to it
afterwards.*

| Metric | Target | Spec |
|---|---|---|
| Case rows persisted at rest, anywhere | **0** | §1.1, §7.1 |
| Free-text fields · sub-district geography · point coordinates in the Extract | **0 · 0 · 0** | §6.1 |
| Extract archives surviving past **72 hours** | **0** | §9.3, §9.5 |
| Extracts released without a human having read the Request first | **0** | §3.2 |

#### D. Every release is accountable

*Today there is no record of what EnvOcc surveillance data was released to whom.
This goes from zero to complete.*

| Metric | Target | Spec |
|---|---|---|
| Releases carrying a named Reviewer Decision + Snapshot | **100%** | §3.2, §10.3 |
| Named Reviewers reachable during business hours | **≥ 2**, enforced by the CLI | §17.5 |

#### E. Scheme-level outcomes — to be baselined

*These are what the sponsor should be judged on a year from now. None can be
targeted yet, because the current manual process is unmeasured (assumption A11).*

| Outcome metric | Baseline | Target |
|---|---|---|
| EnvOcc surveillance data requests served per year | `TBD` | `TBD` — expected to rise once the route is standing rather than a favour |
| Median wait from ask to data, today vs. after | `TBD` | ≤ 24 business hours to a Decision |
| สคร. offices using the service at least once in the first year | 0 | `TBD` — reach beyond DDC headquarters is the point of an internet-facing design |
| Administrator hours per request | `TBD` | Minutes of judgement, not hours of assembly |

> ⚠️ **None of these metrics is a data-protection guarantee about the audit
> record.** "Data does not linger" is a claim about **surveillance data only**
> (§1.1 premise 6). Requester contact details, network data, the Decision chain
> and staff performance data are retained **indefinitely**, by decision. See
> ASSUMPTIONS A3 and RISKS R9–R10.

### EXPECTED DELIVERABLES (สิ่งส่งมอบ / ผลลัพธ์ที่คาดหวัง)

**The application**

1. **Requester surface** — unauthenticated single-page Thai form at `/`, plus
   `/submitted` and `/link-expired` (§16.2, §16.4).
2. **Reviewer surface** — authenticated at `/reviewer`: queue, review screen,
   Decision, Alerts, Re-run, Resend (§10).
3. **Extraction pipeline** — Probe, Fetch (**one call per Report code over one
   shared half-open span**, from the single Span builder), Filter, Project,
   Completeness assert, retry/resume/stall handling (§5.4, §7,
   [ADR 0008](adr/0008-the-pipeline-is-sized-for-one-page.md)).
4. **De-identification layer** — the six rules and the 23-column allowlist (§6).
5. **Extract writer** — one flat CSV, eight writer rules, zipped, fingerprinted
   (§8).
6. **Delivery and retention** — Download token, 72-hour clock, expiry page,
   deletion (§9).
7. **Email** — Delivery, rejection, extraction-failure and collection-lapse mail
   (§11).
8. **Audit record** — schema, event catalogue, reference number, indefinite
   retention (§12).
9. **Observability** — `/health`, `/health/scheduler`, two watchers, Bull Board
   (§14).
10. **Scheduled work** — the business-hours clock and the tick (§15).

**Supporting build artefacts (§17.3)**

11. Static Thai/English **Data dictionary CSV**, checked in, copied into every
    archive.
12. **Province seed migration**, generated from `docs/provinces.csv`, with a
    startup assert treated as a boot failure.
13. **Thai holiday config file**, reviewed annually.
14. **Host CLI commands** — Reviewer seeding, password reset, TOTP re-enrolment,
    deactivation, Redaction, fingerprint verification, upstream traffic report.
15. **Fake upstream dev harness** — required to test §7.6 at all. Must expose a
    500 mid-loop, a slow page, a truncated page, an auth expiry mid-job, and a
    shifting `total_items`. **Standing constraint: no real patient data ever seeds
    it.**

**Documentation (already delivered)**

16. [`spec.md`](spec.md) **v1.2** — 2,914 lines, complete for implementation.
17. [`CONTEXT.md`](../CONTEXT.md) — the canonical glossary.
18. **ADRs 0001–0009** — the hard-to-reverse decisions and their reasoning.
19. [`docs/srs.md`](srs.md) **v1.2** — 31 functional and 34 non-functional
    requirements, the traceability matrix, the accepted-risk register and the
    seven remaining open questions.

---

## PROJECT SCOPE (ขอบเขตโครงการ)

### WITHIN SCOPE (สิ่งที่อยู่ในขอบเขต)

- A Thai-language web application, **internet-facing**, on a single Docker host
  inside DDC infrastructure, reached through the ministry-managed edge (§3.1,
  §17.4).
- **Unauthenticated Requester surface; authenticated Reviewer surface** on the
  same app and the same public route (§3.1).
- **Human approval of every Request** before any data is fetched (§3.2).
- **De-identification to 23 allowlisted columns**, geography no finer than
  district (อำเภอ) (§6).
- **Live extraction from the upstream DDC DDS API** — one call per Report code
  over one shared span, sequential, global concurrency of 1 (§5, §7, §13.2).
- **One zipped CSV per approved Request**, delivered by email link, expiring and
  deleted at 72 hours (§8, §9).
- **A permanent audit record** of Requests, Decisions, Deliveries and downloads
  (§12).
- **Reviewer account management** — username + password + TOTP, minimum two named
  Reviewers, CLI-seeded (§17.5).
- **Health endpoints and operational alerting** to the Reviewer queue and to the
  Requester on failure (§14).
- **Everything from the TCP connection inward** on the VM (§17.4).

### OUTSIDE OF SCOPE (สิ่งที่อยู่นอกขอบเขต)

Named so nobody adds them back without reopening the decision (§1.2):

- **Mechanical identity verification** — email-domain rules, staff-directory
  matching, a `workplace` picklist. The identity check is **human judgement**; a
  mechanical layer would be false comfort, not defence in depth (§3.3).
- **Reviewer editing of a Request before approval.** Approve or reject only — an
  editable Request breaks the audit chain.
- **Live job progress for the Requester.** The flow is fully asynchronous: submit
  → confirmation page → close the tab → email.
- **Ingesting or storing surveillance data at rest.**
- **A gated case-level or tambon-granularity service for outbreak
  investigation.** That is a different service, with real authentication and a
  lawful basis per request.
- **Scraping resistance, per-client quotas, or any row cap** (§13.1).
- **The fake upstream service as a product deliverable.** It is an implementers'
  dev harness, not part of the destination.
- **Server-side rendering and prerendering** of the SPA (§16.1).
- **Any retention or deletion job for the audit record.** Nothing is ever deleted
  (§12.7).
- **Self-service password or email reset for Reviewers, and TOTP recovery codes**
  (§17.5).
- **The ministry-managed edge itself.** Owned by DDC infra; its timeouts,
  buffering and body caps are shared ministry policy and are **not assumed
  tunable**. The design is robust to the worst plausible edge (§17.4).
- **Multi-language UI.** Thai is the only language shown to a person (§16.3).

---

## TENTATIVE SCHEDULE (กำหนดการเบื้องต้น)

Software delivery mapped onto the template's DMAIC phases. Dates are indicative
within the September–November 2026 window and are `TBD: confirm`.

| KEY MILESTONE | Mapped work | START (วันที่เริ่ม) | FINISH (วันที่สิ้นสุด) |
|---|---|---|---|
| **Form Project Team / Preliminary Review / Scope** | Repo, skills config, upstream API verification (#4), disease-group research (#3) | 2026-08-27 | 2026-09-01 |
| **Finalize Project Plan / Charter / Kick Off** | This charter; sponsor sign-off | 2026-09-02 | 2026-09-05 |
| **Perform Defining Phase** | **✅ COMPLETE** — 33 decision tickets resolved (#2–#34), `CONTEXT.md`, ADRs 0001–0009, `spec.md` v1.2, `docs/srs.md` v1.2 | 2026-08-27 | 2026-09-04 |
| **Perform Measurement Phase** | Dev-cycle asks §17.2. ✅ **Closed 2026-09-04:** ~~`birth_date` null rate~~ (estimated <1%), ~~`diagnosis_icd10_list` delimiter~~ (a comma), ~~three test sends~~ and ~~relay hostname~~ (closed without being performed; carried as risk R18 instead). **Remaining:** SMTP config (`SMTP_PORT`, `SMTP_PASS`, `FRONTEND_URL`) and the **wireframe** | 2026-09-08 | 2026-09-19 |
| **Perform Analysis Phase** | Ticket breakdown from `spec.md` with blocking edges; dev harness design | 2026-09-08 | 2026-09-12 |
| **Perform Improvement Phase** | Build, ticket by ticket, test-first: fake upstream harness → pipeline → de-identification → writer → delivery → Reviewer surface + auth → email → audit → observability | 2026-09-15 | 2026-10-31 |
| **Perform Control Phase** | Required tests §17.1; VM request; host firewalling; NTP; province seed; **end-to-end download smoke test through the real ministry edge as a first-deploy gate**; Reviewer seeding ceremony; production deploy | 2026-11-03 | 2026-11-21 |
| **Deliver Project Summary Report and Close Out** | Handover, operator runbook, close map issue #1 | 2026-11-24 | 2026-11-28 |

> ⚠️ **The largest schedule risk sits in Control, not Improvement.** The
> end-to-end download through the real ministry edge is **the last item
> testable**, because no public route or ministry certificate exists before
> production (§17.4).
>
> ⚠️ **It is no longer a *large*-download test.** This charter previously sized it
> at 20–30 MB; the archive is **tens of KB** (§13.5). The gate is therefore about
> **the path existing** — DNS, certificate, route, range requests — not about a
> large payload surviving the edge. The schedule risk is unchanged; its reason is
> not.

---

## RESOURCES (ทรัพยากร)

| Field | Value |
|---|---|
| **PROJECT TEAM** (ทีมงาน) | **Rawinan Soma** (project manager, sole developer), working with **Claude Code** as an AI pair. Single-developer project — see RISKS. |
| **SUPPORT RESOURCES** (ทรัพยากรสนับสนุน) | **DDC infra team** — owns the VM and registration of the public route through the ministry-managed edge, the public DNS name under `moph.go.th`, the ministry-issued TLS certificate, and host-level firewalling (§17.4). |
| **SPECIAL NEEDS** (ความต้องการพิเศษ) | **PDPO (Personal Data Protection Officer)** — required for the PDPA §26 lawful-basis question and the de-identification / retention rulings. See ASSUMPTIONS. |

**Not yet named, and needed:**

- `TBD` — the **upstream DDS API owner** at DDC, who holds the token and the data
  agreement. §5.5 records that the failure mode to fear is *not* a throttle but
  **DDC noticing our traffic and revoking the token, which no retry recovers
  from**. That relationship needs an owner.
- `TBD` — the **mail relay owner**, for `SMTP_PORT`, `SMTP_PASS` and confirmation
  of the relay hostname verbatim (§11.2, §17.2).
- `TBD` — the **second named Reviewer**. The minimum is **two reachable people,
  not two rows in a table** (§17.5); it is also the only TOTP recovery mechanism.

---

## COSTS (ต้นทุน / ค่าใช้จ่าย)

**No cash budget is sought.** Internal staff time only, on existing DDC
infrastructure.

| COST TYPE | VENDOR / LABOR NAMES | RATE | QTY | AMOUNT |
|---|---|---|---|---|
| Labor | Rawinan Soma — development, Sep–Nov 2026 | `TBD` internal rate | `TBD` hrs | Notional |
| Labor | DDC infra team — VM provisioning, route registration, firewalling | `TBD` | `TBD` hrs | Notional |
| Labor | Reviewers (×2) — seeding ceremony, ongoing review | `TBD` | `TBD` hrs | Notional |
| Labor | PDPO — consultation | `TBD` | `TBD` hrs | Notional |
| Supplies | — | — | — | 0 |
| Miscellaneous | VM capacity, DNS name, ministry TLS certificate, mail relay | Existing DDC/ministry provision | — | 0 |
| | | | **TOTAL COSTS** | **0 cash; staff time TBD** |

> **What "no budget" costs.** With no procured hardware, no licences and no
> vendor, the project's entire cost is **one person's time plus an unquantified
> ongoing review burden on two administrators**. That is the honest exposure, and
> it is a risk, not a saving — see RISKS.

---

## BENEFITS AND CUSTOMERS (ผลประโยชน์ & ลูกค้า)

| Field | Value |
|---|---|
| **PROCESS OWNER** (เจ้าของกระบวนการ) | **The two administrators** who handle DDS data requests manually today, and who become the named **Reviewers** under the new process. `TBD: names` |
| **KEY STAKEHOLDERS** (ผู้มีส่วนได้ส่วนเสียหลัก) | EnvOcc division (sponsor and owner) · the two Reviewers / administrators · DDC infra team · PDPO · **สคร. regional offices** (the requesting population) · the upstream DDS API owner at DDC |
| **FINAL CUSTOMER** (ลูกค้าที่เป็นผู้บริโภค) | **Officers working on EnvOcc disease surveillance** — at DDC and สคร., reading Thai, analysing in Excel, R or Python. |
| **EXPECTED BENEFITS** (ประโยชน์ที่คาดว่าจะได้รับ) | A predictable, auditable, safe route to case-level EnvOcc surveillance data that replaces an unrecorded manual favour with a recorded, human-gated release. |

| TYPE OF BENEFIT | BASIS OF ESTIMATE | ESTIMATED BENEFIT AMOUNT |
|---|---|---|
| **Specific Cost Savings** (ประหยัดค่าใช้จ่าย) | Administrator hours currently spent assembling and de-identifying extracts by hand × requests per year × internal hourly rate | `TBD` — **baseline not on record** |
| **Enhanced Revenues** (รายได้เพิ่มขึ้น) | Not applicable — internal government service, no revenue | **0** |
| **Higher Productivity** (ปริมาณงานเพิ่มขึ้น) | Reviewer time per Request falls to a judgement decision (minutes) from a full manual extract build; requests servable per year rises correspondingly. Requester wait falls from an ad-hoc favour to ≤24 business hours. | `TBD` — **baseline not on record** |
| **Improved Compliance** (การดำเนินงานปรับปรุงดีขึ้น) | Today: **no audit record of releases at all, and de-identification by hand.** After: 100% of releases carry a named Decision + Snapshot; de-identification is a code-enforced 23-column allowlist. **This is the project's principal benefit and it is qualitative — it goes from zero to complete.** | Not monetised |
| **Better Decision Making** (การตัดสินใจดีขึ้น) | สคร. officers gain analysable line-list data on predictable turnaround, including asks that are currently impossible to fulfil (the 1.14 M-row full-year group `02` extract) | Not monetised |
| **Less Maintenance** (ค่าใช้จ่ายบำรุงรักษาลดลง) | Not applicable — this **adds** a system to maintain. Ongoing cost, not a saving. | **Negative — see RISKS** |
| **Other Costs Avoided** (ต้นทุนอื่นที่หลีกเลี่ยงได้) | Avoided cost of a disclosure incident arising from a hand-built extract that leaked a field it should not have | Not monetised |
| | | **TOTAL BENEFIT: `TBD`** |

> **To fill the `TBD` rows, two numbers are needed:** *how many DDS data requests
> are handled manually per year*, and *roughly how many staff-hours each*. With
> those, Cost Savings and Higher Productivity compute honestly. Without them,
> monetised figures would be invented, and this charter does not invent them.

---

## RISKS, CONSTRAINTS, AND ASSUMPTIONS (ความเสี่ยง ข้อจำกัด สมมติฐาน)

### RISKS (ความเสี่ยงโครงการ)

Drawn from `spec.md` §18, where each was **put explicitly, weighed, and adopted —
none is an oversight.** Ordered by exposure.

| # | Risk | Exposure | Response |
|---|---|---|---|
| **R1** | **The lawful basis is legal obligation, but nothing in writing proves it was established** (§18.1, revised 2026-09-04). The DDC PDPO **was consulted** and the basis is the department's own duty under พ.ร.บ. 2562 — but **no dated memo, named officer or cited section is checked in**, and a basis nobody can produce on request is indistinguishable to an auditor from one never obtained. The approval gate remains an **accountability record, not a lawful basis**. | **Medium** — reduced from *Highest* on 2026-09-04, when the consultation was confirmed. Owned by the project manager. | **The gap is now the record, not the position.** Produce a dated memo naming the officer and the section relied on (A1, SRS OQ-03). Reversal path unchanged: the kill switch — `docker compose down`, minutes (§17.4). |
| **R2** | **Re-identification from the Extract.** The finest *named* geography is district, but the finest *effective* geography is narrower: an occupational case in a small district with a known employer can be narrow enough to identify (§18.2). PDPA identifies data as personal when a person can be identified **indirectly**. | High, accepted | No small-cell suppression, by decision (§6.1 rule 5) — it would break the completeness invariant. Human gate judges proportionality using the Probe row count. |
| **R3** | **Full `birth_date` is retained beside a derived age that already replaces it** (§18.3). DOB coarsening was offered and declined four times. The realistic adversary is the employer. | High, accepted | Mitigations remain available and unused, each a single configuration change. Reopen if the threat model changes. |
| **R4** | **Single-developer project.** One person builds, deploys and operates this. There is no second person who knows the system. | High, **not in §18** | `TBD` — no response on record. Consider naming a second technical contact before Control phase. |
| **R5** | **Upstream token revocation.** The failure mode to fear is not a throttle but **DDC noticing our traffic and revoking the token, which no retry recovers from** (§5.5). | High | Global extraction concurrency of 1; upstream traffic accounting report (§13.6). Needs a named upstream owner. |
| **R6** | **The end-to-end download smoke test through the real ministry edge is untestable before production** (§17.4). No public hostname or ministry certificate exists during development. ⚠️ No longer a *large*-download test — the archive is tens of KB — so this is about **the path existing**, not the payload. | Medium–high, schedule | First-deploy gate, exercised deliberately rather than discovered through a Requester. |
| **R7** | **NTP drift locks out every Reviewer simultaneously.** TOTP is clock-dependent, there is no email reset path, and the only fix is shell access to the machine that is broken (§17.4). | Medium, severe if it fires | NTP sync on the Docker host is a hard requirement, not a recommendation. |
| **R8** | **Email delivery is unobservable** (§18.8, ADR 0001). The system cannot tell whether mail arrived. A Requester can wait for an Extract that was never delivered, through nobody's fault. | Medium, by design | Banners on the first failure; collection-lapse Alert at 24 business hours (§11.4). |
| **R9** | **The audit record is permanent personal data, including about people who never used the service** (§18.9) — `token_lookup` rows are IP addresses of anonymous strangers who presented a bad token. **The system's longest-lived body of personal data is about people who are not its users and not staff.** | Medium, accepted | Kept deliberately: a token-guessing sweep is only ever visible in hindsight. Redaction is available as a bounded courtesy (§12.8). |
| **R10** | **The record measures named staff, permanently** (§18.10) — the login stream, failed logins, expiry timings, cleared alerts. | Medium, accepted | Staff are told at seeding and first login (§12.9). |
| **R11** | **Excel may silently corrupt a leading-zero `hospital_code`** (§18.5, narrowed 2026-09-04) — and Excel is a primary tool of the audience. Excel's type inference ignores quoting, and this repository deliberately holds no facility list, so whether any in-scope code begins with a zero is **not verifiable here**. ⚠️ **Two halves of this risk were withdrawn:** there is **no province `01`** — the geography domain runs 10–96, re-verified against 77 provinces, 929 districts and 7,451 subdistricts — and the **row-truncation claim is retired** (§18.6), having been sized on out-of-scope code `02`; the largest Extract is **1,952 rows, 0.19% of Excel's ceiling**. | **Low**, accepted | Documented in the Data dictionary shipped in every archive. ⚠️ Both withdrawals came from checking data **already in this repository**. *The reasoning that accepted them is the thing to distrust, not the individual claim.* |
| **R12** | **The record cannot say which Request produced an Extract** (§18.7). | Low, accepted | — |
| **R13** | **Internal reachability is a larger question than internet reachability** (§17.4). Being unreachable through the edge is automatic; being unreachable from any DDC desktop is not. A directly reachable MinIO bucket would bypass the Download token and the download audit entirely. | Medium | **Host-level firewalling required, not just edge routing.** Confirmed by testing from outside. |
| **R14** | **This project adds a system to maintain**, with no budget line for its operation after November 2026. | Medium | `TBD` — operational ownership after handover is not on record. |

### CONSTRAINTS (ข้อจำกัดโครงการ)

**Imposed by upstream — absorbed, not chosen (§1.1 premise 7)**

- **365-day maximum date range** per Request. The system does not split
  automatically; the Requester reduces the span (§4.2).
- **~3.5 s fixed cost per upstream request**, near-independent of rows returned.
  Request *count* is the cost driver.
- **`OFFSET`-based pagination with a ~60 s gateway timeout** — pages past roughly
  50 are unreachable. ⚠️ **Nothing in scope comes near it**: the largest Extract a
  Requester can express is **one page**, so this is handled by one loud failure and
  by nothing else. *This charter previously called date-chunking "mandatory for
  correctness"; monthly chunking was removed as self-inflicted
  ([ADR 0008](adr/0008-the-pipeline-is-sized-for-one-page.md)), and a single **Span
  builder** now holds the one expression of a Request's date range.*
- **An unknown `group_code` returns `200` with `data: []`**, so a stale or
  mistyped code is indistinguishable from *"no cases this period"* — which is why
  the picker is seeded and why the Probe's zero-row catch exists.
- **No field-projection parameter**, so plaintext identifiers transit the
  extractor on every Request. De-identification is **ours, post-fetch** — never
  written to disk.
- **Concurrency buys nothing** — upstream serializes. Eight concurrent requests
  degraded from ~3.9 s to ~14.3 s each. Extraction is sequential, global budget 1.
- **Two different error-body shapes**, both of which the client must handle.
- **No fixed upstream schema** is guaranteed (§6.6).

> Strip these away and the extraction pipeline collapses to a controller method.
> **A later reader will otherwise assume the complexity is self-inflicted.**

**Imposed by the environment**

- **The ministry-managed edge is not administered by this project.** Its timeouts,
  buffering and body caps are shared ministry policy and are **not assumed
  tunable** (§17.4).
- **No public hostname and no ministry TLS certificate exist during development.**
  The base URL is therefore explicit configuration, never derived from the `Host`
  header.
- **Single Docker host**, one container, one port, one public route.
- **สคร. staff work from ordinary internet connections, not a ministry VPN** — so
  a network boundary is not available as a control (§3.1).

**Imposed by decision**

- **Thai is the only language shown to a person** (§16.3).
- **Nothing in the audit record is ever deleted** (§12.7). No retention job, no
  deletion role.
- **Minimum two active Reviewers**, enforced by the CLI, not merely documented
  (§17.5).
- **No real patient data ever seeds the dev harness** (§17.3).
- **Reviewer passwords are 12–20 characters** — the 20-character ceiling is
  deliberate and is the binding constraint on password strength (§17.5).
- **No lockout on failed sign-in, throttling only** — a lockout an anonymous
  stranger can trigger against a named account *is* the denial of service (§17.5).
- **No budget.** Internal time only.

### ASSUMPTIONS (สมมติฐาน)

| # | Assumption | Status |
|---|---|---|
| **A1** | **The release of de-identified case-level DDS data rests on legal obligation** — the department's own duty to run occupational and environmental disease surveillance under พ.ร.บ. 2562. | ⚠️ **Revised 2026-09-04 — narrowed, not closed.** The DDC PDPO **has been consulted** and this is the position (§18.1); the previous entry, which said no consultation was sought and no basis recorded, is superseded. **What is missing is the artefact**: no dated memo, no named officer, no cited section is checked in. The approval gate remains an **accountability record, not a lawful basis** — *precisely because the gate feels like it closes the compliance hole, and that feeling is how the paperwork never gets chased.* Reversal path unchanged: the kill switch (§17.4). |
| **A2** | The de-identification allowlist of **23 columns**, with geography no finer than district, is sufficient to render the Extract non-personal for PDPA purposes. | ⚠️ **Still unverified, and not covered by A1's consultation.** The PDPO was consulted on the **lawful basis**, not on whether this allowlist de-identifies adequately. §18.2 records that the finest *effective* geography is narrower than the finest *named* geography — an argument about whether the de-identification claim holds at all, and it is **not softened** by the consultation. |
| **A3** | Indefinite retention of Requester contact data, network data, accountability data and staff performance data is lawful on **legal obligation and legitimate interest**, for auditing and traceability of data releases. | Recorded in ADR 0004. Consent was rejected on the merits: a Requester withdrawing it could erase the record of a release that actually happened. |
| **A4** | DDC infra will provide a VM, a public route through the ministry edge, a `moph.go.th` DNS name and a ministry TLS certificate. | **Requested and verified after the fact — explicitly not preconditions** (§17.4). The design does not depend on any of them being tunable. |
| **A5** | The upstream DDS API remains available on its current contract, and the token is not revoked. | Measured against the live API (#4). §5.5 names revocation as the failure no retry recovers from. |
| **A6** | Upstream `total_items` is trustworthy as a completeness check. | Enforced **per Report code**: a code whose received count disagrees with `total_items` **fails the job and publishes nothing** (§7.5). |
| **A7** | Two named Reviewers are reachable during business hours. | **Reviewer unavailability converts directly into expired Requests** (§3.1). The two-account minimum is also the only TOTP recovery mechanism (§17.5). |
| **A8** | Requesters read Thai and analyse in Excel, R or Python. | Drives §16.3, the UTF-8 BOM, and the Excel caveat in §18.5 (§18.6 retired 2026-09-02). |
| **A9** | The Requester's self-declared identity, checked by human judgement, is an adequate identity control. | By decision — mechanical verification is a named non-goal (§1.2, §3.3). |
| **A10** | The Extract archive traverses the ministry edge successfully. | **Untestable before production.** First-deploy gate (§17.4, R6). ⚠️ **Revised 2026-09-04:** the archive is **tens of KB**, not the ~20–30 MB this row previously assumed — so the gate tests **that the path exists**, not that a large payload survives it. |
| **A11** | The current manual process has a measurable request volume and per-request effort. | ⚠️ Not yet measured. Blocks the monetised rows of the BENEFITS table. |

---

## PREPARED BY (เตรียมเอกสารโดย)

| PREPARED BY | TITLE (ตำแหน่ง) | DATE (วันที่) |
|---|---|---|
| Rawinan Soma | `TBD` | 2026-09-04 |

**Sponsor approval**

| APPROVED BY | TITLE | DATE | SIGNATURE |
|---|---|---|---|
| `TBD` | Director, EnvOcc | | |

> **What signing this charter accepts.** The lawful basis is **legal obligation**
> under พ.ร.บ. 2562, and the DDC PDPO **has been consulted** (A1, §18.1) — but
> **no written artefact of that consultation exists**, so the position cannot be
> produced on request. The approval gate is an **accountability record, not a
> lawful basis**, and **A2 — that the 23-column allowlist renders the Extract
> non-personal — was not what the PDPO was asked about** and remains unverified.
> Approving this charter accepts risks **R1–R3** as stated, and carries the
> outstanding action of putting the PDPO's ruling in writing (SRS OQ-03).
