# Disease groups — the classification

**Authoritative.** Classified by the repo owner, 2026-09-02. This file is the seed
for the Request form's picker and for the classification block of the Data
dictionary shipped in every Extract archive (spec §8.2 rule 8).

A **Disease group** is what a Requester picks; a **Report code** is what upstream
is asked for. See `CONTEXT.md`, spec §4.9, and ADR 0006. The Report codes
themselves — ICD-10, official names, provenance — are in
`docs/research/003-disease-group-codes.md`.

## The ten groups

`id` is the stable key. **The name and the code list may be revised; the id may
not**, because stored Requests and Decision Snapshots reference it. Picker order
is the order below.

| # | id | Disease group | Report codes |
|---|---|---|---|
| 1 | `air-pollution` | โรคจากการสัมผัสมลพิษทางอากาศ | 201 |
| 2 | `silicosis` | โรคซิลิโคสิส | 202, 203 |
| 3 | `asbestos` | โรคจากแร่ใยหิน | 204, 205, 206, 207 |
| 4 | `lead` | โรคจากตะกั่วและสารประกอบของตะกั่ว | 208 |
| 5 | `pesticides` | โรคจากสารกำจัดศัตรูพืช | 209, 210, 211, 212, 213, 214, 215, 216, 217, 218 |
| 6 | `confined-space` | การบาดเจ็บจากภาวะอับอากาศ | 219 |
| 7 | `radiation` | โรคจากรังสี | 222, 223, 224 |
| 8 | `work-related` | โรคจากการทำงาน | 220 |
| 9 | `environmental-pollution` | โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม | 221 |
| 10 | `heat` | โรคจากความร้อน | 501 |

## Measured volumes

Probed 2026-09-02 over 2025-08-27 → 2026-08-27, `meta.total_items` only
([#33](https://github.com/rawinan-soma/dds-sharing/issues/33)). Kept here because
the classification is the only place a group's *cost* is visible.

| Disease group | rows/yr | Probe calls, full-year Request |
|---|---|---|
| `air-pollution` | 1,952 | 12 |
| `work-related` | 970 | 12 |
| `heat` | 401 | 12 |
| `environmental-pollution` | 194 | 12 |
| `silicosis` | 129 | 24 |
| `lead` | 95 | 12 |
| `asbestos` | 73 | 48 |
| `pesticides` | 28 | **120** |
| `confined-space` | 15 | 12 |
| `radiation` | 4 | 36 |

**The whole domain is 3,861 rows a year.** Codes 212, 215, 217 and 224 returned
zero. Note the inversion: **`pesticides` is the most expensive group to serve and
the second-smallest to receive** — 120 calls for 28 rows. Cost tracks group
*width*, never volume.

**Partition verified:** 25 Report codes, each in exactly one group, none left out
and none in two — 1 + 2 + 4 + 1 + 10 + 1 + 3 + 1 + 1 + 1 = 25.

> ⚠️ **These 25 are this service's *scope*, not upstream's domain.** The same
> endpoint also serves the general D506 notifiable-disease block — `01` cholera,
> `02` acute diarrhoea, `03` food poisoning, `07`–`09` typhoid, `301`–`303`
> tuberculosis, `401` animal bite, `502` snakebite, `601` hepatitis B, and more
> nobody has enumerated
> ([#33](https://github.com/rawinan-soma/dds-sharing/issues/33), 2026-09-02).
> **This service serves the EnvOcc block only, by decision.** Adding a
> communicable-disease code here is a scope change, not a classification fix — and
> the partition test (spec §17.1) cannot tell the two apart, because it compares
> this file against the seed and never the seed against upstream.

## Notes on the classification

- **`pesticides` is the widest group** — ten Report codes differing only by where
  the poisoning happened, kept as one group because that is the disease. The cost
  is **calls, not rows**: measured volume is **28 rows a year** across all ten
  codes, but the Probe spends ~3.5 s per call whatever comes back, so the group's
  width sets the floor. This is why the Probe runs off the submit path (spec §5.4).
  If it ever needs splitting, split it **here**, as a naming decision, not as a
  runtime rejection.
- **`work-related` and `environmental-pollution` are groups of one, deliberately.**
  The deck presents Y96 and Y97 as companion codes on `208`, but DDS carries them
  as report codes in their own right, so cases arrive under them and they need a
  way to be asked for.
- **`radiation` merges all three radiation codes.** The deck names two radiation
  families whose Thai names both read as ionizing exposure; the distinction is not
  one this audience asks along.
- **`heat` is new and stands alone.** `501` sits outside the EnvOcc `201`–`224`
  block. Expect more codes outside that block, not fewer — but note that `502` is
  **snakebite** (T63.0) and is *not* ours: proximity to `501` is not membership.
- **All ten names are Thai.** The picker shows these strings exactly, and the ids
  beside them are ASCII only because they are keys, never display text.

## Changing this file

The Report code list is amendable by DDC announcement, and this classification is
amendable by its owner. Neither change is retroactive: a Request stores **the
Report codes its group expanded to at submit** (§12.3), so a Re-run months later
refetches what the first run fetched, not what the group means today.

Adding a Report code to DDS therefore requires two edits — the code list in
`docs/research/003-disease-group-codes.md`, and a group for it here. **A code with
no group is unreachable data**, and nothing in the system will notice.
