# dds-sharing

## Agent skills

### Issue tracker

Issues live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### PR flow

`/mattpocock-skills:implement` → `/pr-boarding` → `/pr-clearance` → `/pr-landing`, each in a fresh session (`/clear` between them). In `implement`, "/code-review" means `/mattpocock-skills:code-review`; it runs once there and nowhere else. The pr skills carry their own rules for recording and gating on it.
