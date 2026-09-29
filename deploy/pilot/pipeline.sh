#!/usr/bin/env bash
# The Pilot's deploy pipeline (ADR 0022, #101), run from a machine on the
# tailnet. Every step runs on the Pilot's server over ssh; nothing is deployed
# on merge, and nothing here runs unless someone runs it.
#
#   deploy/pilot/pipeline.sh build    1. build the image from origin/pilot
#   deploy/pilot/pipeline.sh env      2. write the server's .env (interactive, once)
#   deploy/pilot/pipeline.sh config   3. check compose.pilot.yml against that .env
#   deploy/pilot/pipeline.sh run      4. start or update the Pilot
#   deploy/pilot/pipeline.sh check    the exposure checks #101 asks for
#   deploy/pilot/pipeline.sh all      build, config, run, check (env must exist)
#   deploy/pilot/pipeline.sh compose <args>   any compose command, e.g. `ps`,
#                                             `logs app`, `down` (the kill switch)
#
# PILOT_HOST (default personal-test-server) and PILOT_DIR (default ~/dds-pilot
# on the server) override where. The server keeps the source in
# $PILOT_DIR/src (a clone of the public repo on `pilot`) and the secrets in
# $PILOT_DIR/.env, outside the clone.
set -euo pipefail

HOST="${PILOT_HOST:-personal-test-server}"
DIR="${PILOT_DIR:-~/dds-pilot}"
REPO="https://github.com/rawinan-soma/dds-sharing.git"
COMPOSE="$DIR/src/deploy/pilot/compose.sh"

on_server() { ssh "$HOST" "PILOT_DIR=$DIR bash -euo pipefail -s"; }

build() {
  echo "==> 1. build: the image from origin/pilot"
  on_server <<EOF
mkdir -p $DIR
if [ ! -d $DIR/src/.git ]; then git clone --branch pilot $REPO $DIR/src; fi
cd $DIR/src
git fetch --quiet origin pilot
git checkout --quiet pilot
git merge --ff-only --quiet origin/pilot
sha=\$(git rev-parse --short HEAD)
docker build --quiet -t dds-sharing-pilot:\$sha -t dds-sharing-pilot:latest .
echo "built dds-sharing-pilot:\$sha"
EOF
}

env_file() {
  echo "==> 2. env: writing $DIR/.env on $HOST"
  ssh -t "$HOST" "PILOT_DIR=$DIR bash $DIR/src/deploy/pilot/write-env.sh ${1:-}"
}

config() {
  echo "==> 3. compose: checking compose.pilot.yml against the server's .env"
  on_server <<EOF
test -f $DIR/.env || { echo "no $DIR/.env: run \`pipeline.sh env\` first" >&2; exit 1; }
$COMPOSE config --quiet
echo "published ports:"
$COMPOSE config --format json | python3 -c '
import json, sys
for name, svc in json.load(sys.stdin)["services"].items():
    for p in svc.get("ports", []):
        print(f"  {name}: {p.get(\"host_ip\", \"0.0.0.0\")}:{p.get(\"published\")} -> {p[\"target\"]}")'
EOF
}

run() {
  echo "==> 4. run: starting the Pilot"
  on_server <<EOF
set -a; . $DIR/.env; set +a
$COMPOSE up -d --wait postgres
# docker/postgres-init creates the application role with a dev password; the
# Pilot's own replaces it before the app ever connects.
# psql substitutes :'pw' only in what it reads, never in -c: hence stdin.
echo "ALTER ROLE dds_app_login PASSWORD :'pw';" |
  $COMPOSE exec -T postgres psql -q -U postgres -d dds_sharing \
    -v ON_ERROR_STOP=1 -v pw="\$APP_DB_PASSWORD"
$COMPOSE up -d --no-build --remove-orphans
$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
EOF
}

check() {
  echo "==> check: #101's exposure checks"
  local url failed=0
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
$COMPOSE ps --format 'table {{.Service}}\t{{.Ports}}'
if $COMPOSE ps --format '{{.Ports}}' | grep -E '0\.0\.0\.0:|\[::\]:' ; then
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
  config) config ;;
  run) run ;;
  check) check ;;
  all) build && config && run && check ;;
  compose) shift; ssh -t "$HOST" "PILOT_DIR=$DIR $COMPOSE $*" ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
