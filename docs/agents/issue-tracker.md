# Issue tracker: GitHub

Issues and PRs for this repo live on GitHub, `rawinan-soma/dds-sharing`. Use the `gh` CLI for all operations. The build's spec is `docs/spec.md`.

## History

- Issues #1–#98 were GitHub issues. On 2026-09-21 the open ones moved to markdown files under `.scratch/dds-sharing/issues/`; on 2026-09-30 the tracker moved back to GitHub.
- **The closed files in `.scratch/dds-sharing/issues/` are history.** Read them; never add to them.
- **Ticket numbers 99–105 in commits, ADRs and PRs dated before 2026-09-30 mean those files, not GitHub numbers.** GitHub numbers are shared with PRs, so on GitHub `#99`–`#102` are PRs. The open ones moved:

  | File | GitHub |
  |---|---|
  | 77 | #77 (reopened) |
  | 96 | #96 (reopened) |
  | 101 | #122 |
  | 103 | #123 |
  | 104 | #124 |
  | 105 | #125 |

  99, 100 and 102 were closed and exist only as files.

## Conventions

- Branches are named `ticket-<NN>`, after the GitHub issue number.
- The first line of an issue body is `Blocked by: #NN, #NN` when it has open blockers. Omit it when none.
- The body is `## What to build` prose followed by an `## Acceptance criteria` checklist (`- [ ]` lines). `pr-clearance` grades against the checklist.
- The triage role is a label (see `triage-labels.md`); the category is `enhancement` or `bug`.
- A PR closes its issue with `Closes #NN`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue: `gh issue create --title "..." --body-file <file> --label <role>`.

## When a skill says "fetch the relevant ticket"

`gh issue view <NN> --comments`.

## When a skill says "apply a label"

`gh issue edit <NN> --add-label <role>`, removing the previous state role with `--remove-label`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a GitHub issue labelled `wayfinder:map`; each **child** is an issue labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`) whose body starts `Map: #NN`.

- **Blocking**: a `Blocked by: #NN, #NN` first line. A child is unblocked when every issue it lists is closed.
- **Frontier**: open, unblocked, unassigned children of the map; lowest number wins.
- **Claim**: assign yourself (`gh issue edit <NN> --add-assignee @me`) before any work.
- **Resolve**: comment the answer under an `## Answer` heading, close the issue, then add a gist and link to the map issue's Decisions-so-far.
