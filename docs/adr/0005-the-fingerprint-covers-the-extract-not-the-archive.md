# 5. The Extract fingerprint covers the Extract, not the Extract archive

Date: 2026-09-02

## Status

Accepted. Supersedes the checksum clause of #10 ("a SHA-256 of the zip") and
resolves the ripple #25 raised against it. Decided on #29.

## Context

#10 records an **Extract fingerprint** on the job-completion request event —
row count, column count, byte size, and a SHA-256 — so that a permanent record
can say *what* was released rather than merely that a release happened. The
checksum was taken over the zip. That was sound while the zip held one file.

#25 broke both assumptions underneath it.

**A zip's bytes are not reproducible.** The format embeds a modification time
per entry, and the compressed bytes vary with compressor version and
compression level. The same rows therefore produce a different checksum on
every run. A fingerprint that changes when nothing about the data changed
cannot answer *did this Extract come from here*, which is the only question
#10 built it for.

**The archive now holds two entries.** #25's rule 8 ships a static Thai/English
Data dictionary in every archive. Hashing the container mixes a file identical
across every Extract ever produced with the one file that is not.

A further overclaim surfaced while deciding this. #10 asserts the checksum says
"whether it came from here **and which Request produced it**". A content hash
cannot do the second half: two Requesters asking the same question of the same
date range receive identical bytes, and disease group `210` returns zero rows
(#14), so every header-only Extract hashes identically.

## Decision

**The checksum is a SHA-256 of the Extract — the CSV, as written, before the
zip step. One field.** The alternatives were put and declined:

- **A deterministic zip** — fixed entry mtimes, fixed order, pinned compression
  level — recovers byte-for-byte attestation of the delivered container, but
  only by making reproducibility a standing constraint on a library nobody will
  remember it applies to. It is one `pnpm up` from breaking silently, which is
  the same failure this ADR exists to remove.
- **Both, as two fields** — invites the reader of an incident to check the
  wrong one.

Accepted cost, stated rather than discovered: **we cannot attest the delivered
Extract archive byte-for-byte, only the Extract inside it.** #16 already treats
the archive as transport.

**The fingerprint attests content, not provenance.** #10's claim is corrected: a
match narrows to a *set* of Requests, never to one. No identifying mark is added
to the Extract to close that gap — a marker would put an identifier back into a
file that four tickets were spent de-identifying, and would vary the bytes it
was meant to certify.

**The reference-data checksums sit beside the fingerprint, not inside it.**
`docs/provinces.csv` (#24) and the Data dictionary describe what *made* the
Extract; the fingerprint describes what was *released*. Different questions,
different readers.

**The checksum is computed as the writer emits, in one pass.** No checksum
covers the upload to MinIO, and a second read before the upload would not cover
it either.

## Consequences

- **The Extract and its container are now separate terms.** `CONTEXT.md` gains
  **Extract archive**; **Extract** narrows to the CSV. The decision then states
  in one line: *we hash the Extract, not the Extract archive.*
- **Reproducibility becomes a tested property.** The specification requires a
  test that writes the same rows twice and asserts one checksum, plus a fixture
  assertion that the bytes are BOM + CRLF. Without it, #25's "fixed regardless
  of the container's host OS" is a comment, and a writer emitting `os.linesep`
  fails silently.
- **The incident path is a command, not a procedure.** An operator on the
  Docker host passes a file — an Extract archive or a bare CSV — and is told
  which Request it came from, or that nothing matched. The same route as the
  redaction command and #27's Probe report. A written three-step procedure was
  rejected: the epidemiologist audience cannot perform it and is not the
  reader, and the operator should not assemble it by hand during an incident.
- **A match and a mismatch are not equally strong, and the command says so.**
  This audience opens CSVs in Excel; a file opened and re-saved will not match
  although the data is unchanged. A match is strong evidence, a mismatch is
  nearly none.
- **The fingerprint never leaves the record.** Not in the delivery email, not on
  the download page. The Requester has no independent value to compare against,
  and publishing it would convert a byte-exactness property into a promise made
  to an unauthenticated recipient. Interrupted transfers are already covered by
  #16's range requests.
- **#10's fingerprint clause and #25's ripple are both settled**; #10 gains
  `zip_bytes` and the Data dictionary checksum, and the archive filename.
