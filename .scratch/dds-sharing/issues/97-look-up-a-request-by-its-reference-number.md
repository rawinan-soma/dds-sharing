# Look up a Request by its reference number

Status: ready-for-agent
Blocked by: 74, 65
Source: https://github.com/rawinan-soma/dds-sharing/issues/97 (migrated 2026-09-21)

## What to build

A Reviewer types an exact reference number and reads that one Request, including one that has finished and left the Reviewer surface. Spec §10.10; design screen 13 in the Lunagraph project `dds-sharing`; `docs/design/handoff.md` §13.

**Why it exists.** The confirmation, the collection page, the rejection email and the expiry page all tell a Requester to telephone and quote their reference number. Before this, the Reviewer who answered could not find a finished Request, because finished Requests leave the surface (§10.9).

- A search field in the sidebar header, above refresh: **exact reference only**.
- A Request still on the surface opens in its zone as usual.
- A terminal Request opens **read-only**: the ask, the Snapshot's `workplace` and row count, the Decision and its Reviewer, each Extract and its link state, and the event trail newest first. **No actions.**

> ⚠️ **Never the contact fields for a terminal Request** (ADR 0015). Contact details may already have been removed on request, and a lookup must not become the way round that.

> ⚠️ **Never a search by name, email, workplace or telephone.** §10.2 declined prior-Request history on the review screen; a search by person is that history by another route.

## Decided: a lookup writes no event

A lookup is read-only and a read is not an event anywhere in the catalogue, so §12.4 is unchanged. Decided with the repo owner 2026-09-18 (spec §10.10).

## Acceptance criteria

- [ ] An exact reference number finds any Request, terminal or not; anything else finds nothing
- [ ] A terminal Request opens read-only, with no action available
- [ ] No contact field appears for a terminal Request, including after contact details have been removed
- [ ] There is no search by any field other than the reference number
- [ ] A lookup writes no event, of any type

