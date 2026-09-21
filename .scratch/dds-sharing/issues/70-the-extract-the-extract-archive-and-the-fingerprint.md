# The Extract, the Extract archive and the fingerprint

Status: ready-for-agent
Blocked by: 69, 85
Source: https://github.com/rawinan-soma/dds-sharing/issues/70 (migrated 2026-09-21)

## What to build

A completed job writes one CSV, zips it with the Data dictionary, hashes the CSV, uploads the archive to MinIO in one operation, and records what was released. Delivering it to the Requester is the next slice.

**One Request = one CSV**, header emitted once across the code joins. **Row order is fetch order** — Report code ascending, then upstream's own order within a code — so a group of two codes yields all of the first code's rows then all of the second's, and the file reads as what it is.

**The eight writer rules.** The writer receives a fixed, ordered 23-column row and **carries no column semantics**.

1. **UTF-8 with BOM** — the only way Excel opens Thai correctly on a double-click, and that is the audience. The BOM is inside the file and therefore inside the fingerprint.
2. **CRLF line endings, fixed — never `os.linesep`.** A writer emitting the platform separator produces a different fingerprint for the same rows depending on where it ran, which would make the checksum attest to the machine as much as to the data.
3. Empty cell written **bare**: `a,,c`, never `a,"",c`.
4. **Trim** leading and trailing whitespace on every value. This is the load-bearing half of rules 3+4 — without it a whitespace-only upstream value survives to the file and there are three null representations again. It is safe only because all 23 retained columns are codes, dates or ids.
5. **RFC 4180 minimal quoting** — quote only on comma, double-quote, CR or LF.
6. **Uppercase-normalise `diagnosis_icd10` and `diagnosis_icd10_list`, and nothing else.** ICD-10 is canonically uppercase, and both `A150` and `a150` were observed upstream; pass-through means an analyst's group-by silently splits one disease into two. A blanket uppercase is how a writer starts inventing data.
7. **English upstream field names** in the header row. Thai headers break attribute access in pandas and R, and the English names are what the allowlist, the spec and any column list shown to a privacy officer all use.
8. A static **Thai/English Data dictionary** ships in every Extract archive.

**The Data dictionary** is a checked-in static CSV — 23 column rows plus the Disease group classification — copied into every archive under a fixed filename. It carries the classification because that taxonomy is **ours, not upstream's**: a Requester who asked for ซิลิโคสิส must be able to read which Report codes we took that to mean, without asking us. It is a property of the service, never of the Request, and is identical in every archive ever made. **It must note the BOM**: `pandas.read_csv` without `encoding='utf-8-sig'` yields a first column literally named with the BOM prefix, and the R/Python reader is exactly the person who will not have hit that before.

**The zip stays, but not for the reason a later reader will assume.** The transfer-size argument is dead — the real worst case is 1,952 rows, roughly 400 KB, compressing to tens of KB. **The archive carries two files**, and a container is the only way to deliver a CSV alongside the document that explains its columns.

**Archive naming**: `dds-envocc-sharing-{YYYYMMDD}-{HHMMSS}.zip`, Asia/Bangkok, from the Request's **submit** moment. The CSV inside shares the stem with `.csv`; the Data dictionary has a fixed name. **A Re-run carries a `-r2`, `-r3` suffix** — a Re-run makes no new submit moment, so without a suffix it would produce a second archive with different rows, a different fingerprint and a different token **under the same filename, silently replacing the first on the Requester's disk**. The filename holds no reference number.

**The fingerprint is a SHA-256 of the Extract — the CSV as written, before the zip step — computed in one pass as the writer emits.** Not the archive: a zip embeds a per-entry modification time and varies with compressor version and level, so the same rows would hash differently on every run. A deterministic zip was available and declined — it recovers container attestation only by making reproducibility a standing constraint on a library nobody will remember it applies to.

> ⚠️ **The fingerprint attests content, never provenance.** Two Requesters asking the same question of the same date range receive identical bytes, and every header-only Extract hashes alike. **A match narrows to a set of Requests, never to one.** No identifying mark is ever added to the Extract to fix this — a marker would put an identifier back into a file this design spent four decisions removing them from.

**The fingerprint never leaves the record.** Not in the Delivery email, not on the download page. The Requester has nothing to compare it against, and publishing it converts a byte-exactness property into a promise made to an unauthenticated recipient.

**Storage during the job**: each code's output goes to a local scratch volume, and the finished zip uploads to MinIO in **one** operation at the end. This makes *"an object exists in the bucket"* mean exactly *"a complete, publishable Extract"* — the invariant the Download token and the lifecycle rule both rest on. **Scratch is deleted immediately on successful upload**, code checkpoints included, so exactly one copy exists after completion.

> ⚠️ **No checksum covers the upload to MinIO.** The choice was between two passes and one, not between checked and unchecked. Recorded so it is not rediscovered.

`job_completed` carries **two groups, deliberately not merged**: the **Extract fingerprint** — *what was released* — as `row_count`, `column_count`, `csv_bytes`, `zip_bytes`, `csv_sha256`; and the **reference data** — *what made it* — as `provinces_checksum` and `data_dictionary_checksum`. Both sizes are kept and named distinctly: the Extract's size is the data's size, the archive's is what the disk bound reasons about. Plus the archive filename, the count of impossible derivation inputs, and the **Probe-vs-run drift** — the Probe's per-code totals against the run's, **recorded, never asserted**. Hours to days pass between them and upstream keeps receiving reports for past dates, so failing on drift would fail correct jobs; it is kept because it is the only witness that would ever show the Probe's range builder and the job's had diverged.

## Acceptance criteria

- [ ] One CSV per Request, header emitted once, rows in Report-code-ascending then upstream order
- [ ] The writer receives ordered rows and holds no column semantics — no column name appears in writer logic
- [ ] All eight writer rules hold: BOM, fixed CRLF, bare empty cells, trimmed values, RFC 4180 minimal quoting, ICD-10 uppercase only, English headers, Data dictionary present
- [ ] The Data dictionary is checked in, static, identical in every archive, carries the Disease group classification, and notes the BOM for pandas readers
- [ ] Archives are named from the Request's submit moment in Asia/Bangkok, with the CSV sharing the stem and a `-rN` suffix reserved for Re-runs
- [ ] No reference number appears in the archive filename
- [ ] The fingerprint is a SHA-256 of the CSV before zipping, computed in one pass during writing
- [ ] The fingerprint appears nowhere outside the audit record — not in an email, not on a page
- [ ] No identifying mark is written into the Extract
- [ ] The finished zip uploads to MinIO in exactly one operation, and scratch plus checkpoints are deleted immediately on success
- [ ] `job_completed` carries the fingerprint group and the reference-data group separately, plus the archive filename, the impossible-input count, and Probe-vs-run drift recorded without assertion
- [ ] §17.1's reproducibility test is in CI: writing the same rows twice on the CI host yields one checksum, with a fixture asserting the bytes begin with the BOM and use CRLF
- [ ] §17.1's quoting test is in CI: a row whose `diagnosis_icd10_list` holds two comma-delimited codes round-trips through the writer as one quoted field

## Blocked by

- #69 — The extraction pipeline

