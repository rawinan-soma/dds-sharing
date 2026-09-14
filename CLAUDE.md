# dds-sharing

## Agent skills

### Issue tracker

Issues live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### PR flow

`/mattpocock-skills:implement` → `/pr-boarding` → `/pr-clearance` → `/pr-landing`, each in a fresh session (`/clear` between them). Nothing carries over between sessions except git and GitHub, so each step leaves its evidence where the next one reads it.

- In `implement`, "/code-review" means `/mattpocock-skills:code-review`. Implement is not done until it has run and every finding is fixed or explicitly accepted by the user. The commit that addresses the findings (or the final commit, when there were none) carries the trailer `Code-Review: standards <clean | N fixed | N accepted>; spec <clean | N fixed | N accepted>`. Commits after the trailer count as unreviewed.
- `pr-boarding` copies that trailer into the PR body's Review section.
- `pr-clearance` posts its verdict as a PR comment headed `## Clearance verdict`, tied to the verified head SHA.
- `pr-landing` reads both from git and the PR. It refuses to merge without them unless the user waives explicitly.
