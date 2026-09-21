# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. GitHub is the SCM and PR host only; GitHub Issues are not used. Issues #1–#98 there are history, closed on 2026-09-21 when the open ones were migrated to files.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`. The current build is `.scratch/dds-sharing/`; its spec is `docs/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md` — never a single combined tickets file.
- **Numbering is one sequence across every feature directory**, continuing from the GitHub issue numbers: the migrated tickets keep their GitHub numbers (`63`–`97`), and the next new ticket is `99`. Never reuse a number. A bare `#NN` in a commit message, ADR or PR therefore always means one ticket. Branches are named `ticket-<NN>`.
- The first lines of a ticket file, under the title:
  - `Status:` — the triage role (see `triage-labels.md`), or `closed`. Required.
  - `Blocked by: NN, NN` — the tickets that must be `closed` first. Omit when none. List only tickets that have a file; a closed GitHub issue is not a blocker.
  - `Labels:` — any extra labels (e.g. `enhancement`). Optional.
  - `Source:` — for migrated tickets, the GitHub issue URL. Optional.
- The body is `## What to build` prose followed by an `## Acceptance criteria` checklist (`- [ ]` lines). `pr-clearance` grades against the checklist.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading, each as `**<author>** — <YYYY-MM-DD>` followed by the text.
- A ticket is open until its `Status:` reads `closed`. `pr-landing` closes it after the merge, citing the merge commit under `## Comments`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/issues/` (creating the directory if needed), numbered one past the highest number in any `issues/` directory.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. Given only a number, find it with `ls .scratch/*/issues/<NN>-*.md`.

## When a skill says "apply a label"

Set the `Status:` line to the role string.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from the shared sequence above, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
