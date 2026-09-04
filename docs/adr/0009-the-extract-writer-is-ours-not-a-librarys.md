# 9. The Extract writer is ours, not a library's

Date: 2026-09-04

## Status

Accepted. Follows [ADR 0005](0005-the-fingerprint-covers-the-extract-not-the-archive.md),
whose reasoning it extends from the Extract archive to the Extract itself.
Amends `docs/srs.md` §2.4 (implementation stack) and pins FR-17. Decided with
the repo owner on 2026-09-04, alongside the rest of the stack.

## Context

FR-17 specifies the Extract byte for byte: UTF-8 with BOM, **CRLF fixed and
never `os.linesep`**, empty cells written bare rather than as `""`, whitespace
trimmed on every value, RFC 4180 **minimal** quoting, uppercase-normalisation on
exactly two columns, English header names emitted once. NFR-30 makes two of
those a required test: write the same rows twice and assert one checksum, and
assert the bytes begin with the BOM and use CRLF.

Those rules are not a formatting preference. The **Extract fingerprint** is a
SHA-256 of the Extract as written, computed in one pass as the writer emits, and
it is the only description of a release that outlives the release. A writer that
changes its output changes the fingerprint of rows that did not change, and
[ADR 0005](0005-the-fingerprint-covers-the-extract-not-the-archive.md) rejected
the deterministic zip for precisely that exposure:

> A deterministic zip … recovers byte-for-byte attestation of the delivered
> container, but only by making reproducibility a standing constraint on a
> library nobody will remember it applies to. It is one `pnpm up` from breaking
> silently, which is the same failure this ADR exists to remove.

That argument was made about the container. It applies harder to the Extract,
because the Extract is the thing actually fingerprinted.

A CSV library expresses every one of the eight rules as configuration —
`record_delimiter`, `quoted`, `quoted_empty`, `quoted_string`, `bom` — which
means each rule's continued truth depends on a default the library is free to
change in a minor release. Nothing in the required tests names the library, so
the failure mode is a green review and a red build, or worse, a green build
against a fixture nobody regenerated.

Two facts remove the usual reasons to take the dependency anyway. **Scale is not
a reason**: [ADR 0008](0008-the-pipeline-is-sized-for-one-page.md) sized the
pipeline for one page, and the largest Extract this service can produce is
**1,952 rows** — nothing needs a streaming formatter for throughput.
**Complexity is not a reason either**: the writer "receives fixed, ordered rows
and carries no column semantics" (FR-17), the column count is fixed at 23, and
rule 4's trim is safe only because every retained column is a code, a date or an
id. There is no embedded newline case, no locale case, no type inference, no
schema discovery — the parts of CSV writing that justify a library are exactly
the parts the allowlist already removed.

## Decision

**The Extract writer is written in this repository, in one file, and takes no
CSV dependency.** It emits the header once, streams rows in fetch order, applies
rules 1–7 byte for byte, and accumulates the SHA-256 in the same pass.

The alternatives were put and declined:

- **`csv-stringify`** — the strongest of them, and the only one that can express
  all eight rules explicitly. Declined because expressing them as configuration
  is the failure this ADR is about, not the fix for it.
- **`fast-csv`** — fewer knobs for minimal quoting and bare empty cells, so two
  rules would hold by default rather than by statement.
- **`papaparse`** — string-oriented rather than streaming, and browser-first;
  the wrong shape for a worker.

**This decision is conditional and the condition is not optional.** A
hand-written CSV writer is ordinarily a poor trade. It is the right one *here*
only because NFR-30 tests 1 and 2 pin the output, and they must exist before the
writer is trusted. Without them this ADR has traded a library's defaults for our
own undefended ones, which is worse — the library at least has other users.

## Consequences

- **The eight writer rules become executable, in one place.** NFR-29 asks for
  one expression of each rule; the writer is now that expression for all eight,
  rather than a config object that maps onto seven of them and inherits the
  eighth.
- **A dependency upgrade can no longer change the fingerprint.** The reason
  `pnpm up` was named in ADR 0005 is closed for the Extract as well as for the
  archive.
- **The zip stays a library's job.** `yazl` builds the Extract archive, and the
  asymmetry is deliberate and already justified: the archive is transport and is
  **not** fingerprinted, so a compressor's defaults have nothing to break. Zip
  is also genuinely intricate where CSV, under this allowlist, is not.
- **The writer carries a comment naming this ADR and NFR-30.** The next reader's
  first instinct will be to replace it with a library, and the reason not to is
  not visible from the code.
- **Rule 2 is the one to fear.** `os.linesep` produces a correct-looking Extract
  on the developer's machine and a different fingerprint on the host. It is a
  required test rather than a review item for that reason.
