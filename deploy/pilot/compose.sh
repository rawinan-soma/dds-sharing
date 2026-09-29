#!/usr/bin/env bash
# Docker Compose for the Pilot, on the Pilot's server. Every Pilot command goes
# through here, so the project name, the env file and the two compose files are
# never typed by hand:
#   deploy/pilot/compose.sh ps
#   deploy/pilot/compose.sh down        # the kill switch
#   deploy/pilot/compose.sh exec app node dist/cli/reviewer.js seed ...
set -euo pipefail

PILOT_DIR="${PILOT_DIR:-$HOME/dds-pilot}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

exec docker compose \
  --project-name dds-pilot \
  --env-file "$PILOT_DIR/.env" \
  -f "$SRC/docker-compose.yml" \
  -f "$SRC/compose.pilot.yml" \
  "$@"
