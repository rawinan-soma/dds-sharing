#!/usr/bin/env bash
# The Pilot's deploy pipeline (ADR 0022, #101), run from a machine on the
# tailnet with Docker Hub push rights. The server gets the image, the compose
# files and its own .env — never the repository.
#
#   deploy/pilot/pipeline.sh build    1. build `pilot` here, push rawinan/dds-sharing-pilot:<sha>
#   deploy/pilot/pipeline.sh env      2. write the server's .env there (interactive, once)
#   deploy/pilot/pipeline.sh compose  3. copy the compose files to the server and check them
#   deploy/pilot/pipeline.sh run      4. pull <sha> on the server and start it
#   deploy/pilot/pipeline.sh check    the exposure checks #101 asks for
#   deploy/pilot/pipeline.sh all      build, compose, run, check (env must exist)
#   deploy/pilot/pipeline.sh dc <args>   any compose command on the server, e.g.
#                                        `ps`, `logs app`, `down` (the kill switch)
#
# Everything deployed comes from the committed `pilot` branch here, never the
# working tree: untracked files cannot reach the image. PILOT_TAG=<sha> runs an
# older image instead of the tip (a rollback). PILOT_HOST (default
# personal-test-server) and PILOT_DIR (default ~/dds-pilot on the server)
# override where.
set -euo pipefail

HOST="${PILOT_HOST:-personal-test-server}"
DIR="${PILOT_DIR:-~/dds-pilot}"
IMAGE="rawinan/dds-sharing-pilot"
BRANCH="pilot"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The commit to deploy: `pilot`'s tip, or PILOT_TAG=<sha> to roll back to an
# image already on Docker Hub.
TAG="${PILOT_TAG:-$(git -C "$HERE" rev-parse --short "$BRANCH")}"

# Compose on the server. `release.env` holds the deployed tag, so `down`, `ps`
# and `logs` name the same image `run` started.
DC="cd $DIR && docker compose --project-name dds-pilot --env-file .env \
--env-file release.env -f docker-compose.yml -f compose.pilot.yml"

on_server() { ssh "$HOST" "bash -euo pipefail -s"; }

build() {
  echo "==> 1. build: $BRANCH at $TAG → $IMAGE:$TAG (linux/amd64), push"
  git -C "$HERE" archive --format=tar "$BRANCH" |
    docker buildx build --platform linux/amd64 \
      -t "$IMAGE:$TAG" -t "$IMAGE:latest" --push -
}

env_file() {
  echo "==> 2. env: writing $DIR/.env on $HOST"
  # The script travels as an argument, not on stdin, so its prompts read the
  # terminal; the secrets are typed into the server and nowhere else.
  ssh -t "$HOST" "PILOT_DIR=$DIR bash -c $(printf '%q' "$(cat "$HERE/write-env.sh")") write-env.sh ${1:-}"
}

compose_files() {
  echo "==> 3. compose: copying $BRANCH's compose files to $HOST:$DIR"
  git -C "$HERE" archive --format=tar "$BRANCH" \
    docker-compose.yml compose.pilot.yml docker/postgres-init |
    ssh "$HOST" "mkdir -p $DIR && tar -x -C $DIR"
  on_server <<EOF
test -f $DIR/.env || { echo "no $DIR/.env: run \`pipeline.sh env\` first" >&2; exit 1; }
test -f $DIR/release.env || echo "PILOT_TAG=$TAG" > $DIR/release.env
$DC config --quiet
echo "published ports:"
$DC config --format json | python3 -c '
import json, sys
for name, svc in json.load(sys.stdin)["services"].items():
    for p in svc.get("ports", []):
        print(f"  {name}: {p.get(\"host_ip\", \"0.0.0.0\")}:{p.get(\"published\")} -> {p[\"target\"]}")'
EOF
}

run() {
  echo "==> 4. run: $IMAGE:$TAG on $HOST"
  docker buildx imagetools inspect "$IMAGE:$TAG" >/dev/null 2>&1 || {
    echo "$IMAGE:$TAG is not on Docker Hub: run \`pipeline.sh build\` first" >&2
    exit 1
  }
  on_server <<EOF
echo "PILOT_TAG=$TAG" > $DIR/release.env
set -a; . $DIR/.env; set +a
$DC pull --quiet app cloudflared
$DC up -d --wait postgres
# docker/postgres-init creates the application role with a dev password; the
# Pilot's own replaces it before the app ever connects. psql substitutes
# :'pw' only in what it reads, never in -c: hence stdin.
echo "ALTER ROLE dds_app_login PASSWORD :'pw';" |
  $DC exec -T postgres psql -q -U postgres -d dds_sharing \
    -v ON_ERROR_STOP=1 -v pw="\$APP_DB_PASSWORD"
$DC up -d --remove-orphans
$DC ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
EOF
}

check() {
  echo "==> check: #101's exposure checks"
  local url health failed=0
  url="$(ssh "$HOST" "grep '^FRONTEND_URL=' $DIR/.env | cut -d= -f2-")"

  echo "-- /api/health through the tunnel: $url"
  if health="$(curl -fsS --max-time 15 "$url/api/health")"; then
    echo "$health" | python3 -c '
import json, sys
h = json.load(sys.stdin)
print("  status:", h["status"], "| insecure flags:", h["insecureFlags"] or "none")
sys.exit(1 if h["insecureFlags"] else 0)' || failed=1
  else
    echo "  FAIL: not reachable"; failed=1
  fi

  echo "-- nothing but the tunnel is reachable on the tailnet ($HOST)"
  for port in 3000 3100 5432 6379 9000 9001; do
    if nc -z -w 3 "$HOST" "$port" 2>/dev/null; then
      echo "  FAIL: $port is open"; failed=1
    else
      echo "  closed: $port"
    fi
  done

  echo "-- on the server: published ports, and the clock"
  on_server <<EOF || failed=1
$DC ps --format 'table {{.Service}}\t{{.Ports}}'
if $DC ps --format '{{.Ports}}' | grep -E '0\.0\.0\.0:|\[::\]:'; then
  echo "  FAIL: a port is published beyond loopback"; exit 1
fi
timedatectl show -p NTPSynchronized --value | grep -qx yes \
  && echo "  NTP synchronized" || { echo "  FAIL: NTP not synchronized"; exit 1; }
EOF

  if [[ $failed -eq 0 ]]; then echo "==> all checks passed"; else
    echo "==> CHECKS FAILED"; return 1; fi
}

case "${1:-}" in
  build) build ;;
  env) env_file "${2:-}" ;;
  compose) compose_files ;;
  run) run ;;
  check) check ;;
  all) build && compose_files && run && check ;;
  dc) shift; ssh -t "$HOST" "$DC $*" ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
