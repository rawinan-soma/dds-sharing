# Pull requests

Open PRs with the `/ship-ship` skill (user-scoped, `~/.claude/skills/ship-ship`). It fills the PR body from the whole branch diff and the linked issue's acceptance criteria, runs what CI runs before pushing, and watches checks after opening.

Branch names carry the ticket number (`ticket-67`), which is how the skill finds the issue to link with `Closes #n`.
