# Derived Extract columns are anchored to the case, not the Request

The Extract carries two columns the service computes rather than passes through:
`onset_age` and `epidem_health_zone`. Both replace an upstream column of a
similar name, and both are deliberately named differently from the thing they
replace ([#24](https://github.com/rawinan-soma/dds-sharing/issues/24)).

`onset_age` is the case's age in completed years **at `onset_date`**. The
earlier decision ([#14](https://github.com/rawinan-soma/dds-sharing/issues/14))
computed it against the Request's submission date; we reversed that. A Request
spans up to 365 days and an approval gate can add days more, so a
submission-anchored age reports a case from eleven months back as a year older
than they were when they fell ill, and reports **the same case differently in two
different Requests**. Anchoring on the case makes the value reproducible and
makes two Extracts appendable.

`epidem_health_zone` is the health region of `epidem_chw_code`, resolved through
the 77-row province table from
[#15](https://github.com/rawinan-soma/dds-sharing/issues/15). Upstream's
`health_zone` tracks `isolate_chw_code` — the *treating* unit's address — and the
two disagree on roughly 7% of rows, so reusing the name would hand an analyst a
column they think they recognise. This is the same hazard already recorded for
`chw_code` versus `epidem_chw_code`: plausible, well-formed, silently wrong.

Governing both is **rule 6**, the sixth standing rule of the de-identification
allowlist ([#2](https://github.com/rawinan-soma/dds-sharing/issues/2)): *a
derived column may read only fields that are themselves kept*. Without it the
allowlist's central claim — that no upstream schema change can slip a dropped
field into the Extract — has a hole, because a computation over `tmb_code` is not
a `tmb_code` column and nothing else would stop it.

## Consequences

**Rule 6 binds immediately, and it costs a real repair.** Where `birth_date` is
null, `onset_age` is empty — even though upstream ships an `age_y` that may well
be populated. Falling back to it is exactly what rule 6 forbids, because upstream
`age_y` is a dropped field. We accept the blank rather than carve the exception.
If the dev-cycle measurement of the `birth_date` null rate shows this is
material, the answer is to **re-admit upstream `age_y` to the allowlist** and have
it reviewed as an allowlist change — never a quiet fallback inside the
derivation.

**Derivation is its own pipeline stage.** [#8](https://github.com/rawinan-soma/dds-sharing/issues/8)'s
fetch → filter → write gains a **project** stage between filter and write. Filter
answers *which rows*; project answers *which columns and what is in them*, and
owns the fixed 22-column set, the fixed column order, and both derivations. The
CSV writer is left with encoding only: give it column semantics and rule 6 is
what gets violated later.

**A blank is the only honest failure.** Absent, malformed or impossible inputs —
a null `birth_date`, an `onset_date` before it, an age over 120, a null
`epidem_chw_code` — all emit an empty cell. Never a sentinel, which an analyst's
loader will read as data; never a dropped row, which would break #8's
completeness assert. Impossible values are **counted per job** in the record,
because three of them is bad source data and four hundred thousand means the
derivation is wrong.

**An unknown province code is an outage, not a blank.** A null
`epidem_chw_code` is a gap in the source; a code that is not one of the 77 means
*our table is stale*. It raises the scheduler banner from
[#20](https://github.com/rawinan-soma/dds-sharing/issues/20) rather than silently
blanking a column a regional analyst is about to group by.

**The province table lives in Postgres, seeded from the repo.**
`docs/provinces.csv` stays canonical; a checked-in seed migration is generated
from it and the application's role is read-only. Startup asserts 77 rows and a
checksum and **fails fast**, because a half-applied seed would otherwise blank
`epidem_health_zone` for every row of a 25-minute job. The job reads the table
**once at start** and holds it: a per-row join would let a mid-job edit put two
different regions for one province into a single Extract, and the
[#10](https://github.com/rawinan-soma/dds-sharing/issues/10) fingerprint would
then attest to a file no single state of the database ever produced.

**The lookup's checksum is part of the record.** It goes in the job completion
event. Correct one province's region and the identical Request produces a
different SHA-256; without the checksum the permanent record shows two hashes for
one ask and nothing that explains the difference.

**Derived columns sit beside their inputs.** `onset_age` immediately follows
`onset_date`; `epidem_health_zone` immediately follows `epidem_chw_code`. A
reader scanning the header sees each column next to what produced it — the same
defence the naming buys, without having to read the spec.
