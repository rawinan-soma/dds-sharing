#!/usr/bin/env bash
# Writes the Pilot's .env, on the Pilot's server, once. `make env`
# (deploy/pilot/Makefile) runs it there over `ssh -t` without copying it: the
# secrets are typed into the server and never pass through git or another
# machine.
#
# Asked for: the Pilot's public URL, the Cloudflare tunnel token, the relay
# account, the upstream token. Generated here: every password the Pilot's own
# containers use, including the application role's (docker/postgres-init
# creates it with a dev password; `make run` replaces it).
#
# It refuses to replace an existing .env unless given --force.
set -euo pipefail

PILOT_DIR="${PILOT_DIR:-$HOME/dds-pilot}"
ENV_FILE="$PILOT_DIR/.env"

if [[ -e "$ENV_FILE" && "${1:-}" != "--force" ]]; then
  echo "$ENV_FILE already exists. Re-run with --force to replace it." >&2
  exit 1
fi

ask() { # ask <prompt> [default]
  local answer
  read -rp "$1${2:+ [$2]}: " answer
  echo "${answer:-${2:-}}"
}
ask_secret() {
  local answer
  read -rsp "$1: " answer
  echo >&2
  [[ -n "$answer" ]] || { echo "$1 must not be empty." >&2; exit 1; }
  echo "$answer"
}
secret() { openssl rand -hex 24; }

echo "The Pilot's .env (ADR 0022). Secrets are not echoed."
FRONTEND_URL="$(ask 'Pilot URL, https:// and no trailing slash (e.g. https://pilot.example.com)')"
[[ "$FRONTEND_URL" =~ ^https://[^/]+$ ]] || {
  echo "The Pilot URL must be https:// and an origin only." >&2
  exit 1
}
TUNNEL_TOKEN="$(ask_secret 'Cloudflare tunnel token')"
SMTP_HOST="$(ask 'Relay host' 'mailrelay.uc-workd.com')"
SMTP_USER="$(ask 'Relay user')"
SMTP_PASS="$(ask_secret 'Relay password')"
SMTP_FROM="$(ask 'Sender address (From), on @ddc.mail.go.th' noreply-dds-sharing@ddc.mail.go.th)"
UPSTREAM_TOKEN="$(ask_secret 'Upstream (DDS) token')"

POSTGRES_PASSWORD="$(secret)"
APP_DB_PASSWORD="$(secret)"
MINIO_ACCESS_KEY="pilot-$(openssl rand -hex 8)"
MINIO_SECRET_KEY="$(secret)"

mkdir -p "$PILOT_DIR"
umask 077
cat >"$ENV_FILE" <<EOF
# The Pilot (ADR 0022). Written by deploy/pilot/write-env.sh on $(date -u +%F).
# REFERENCE_PREFIX is fixed to PLT in compose.pilot.yml, not here.

# --- app ---
# One hop: cloudflared, which forwards Cloudflare's X-Forwarded-For.
TRUST_PROXY=1
FRONTEND_URL=$FRONTEND_URL
SCRATCH_DIR=/scratch
LOG_DIR=/logs

# --- tunnel ---
TUNNEL_TOKEN=$TUNNEL_TOKEN

# --- postgres ---
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgres://postgres:$POSTGRES_PASSWORD@postgres:5432/dds_sharing
# Replaces docker/postgres-init's dev password at every 'make run'.
APP_DB_PASSWORD=$APP_DB_PASSWORD
APP_DATABASE_URL=postgres://dds_app_login:$APP_DB_PASSWORD@postgres:5432/dds_sharing

# --- redis ---
REDIS_URL=redis://redis:6379

# --- minio ---
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET=dds-sharing

# --- smtp: the real relay, never a catcher (ADR 0022) ---
SMTP_HOST=$SMTP_HOST
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_SECURE=false
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM

# --- upstream: the real one (ADR 0022) ---
UPSTREAM_BASE_URL=https://exchange.ddc.moph.go.th/api/d506/v1
UPSTREAM_TOKEN=$UPSTREAM_TOKEN
EOF
echo "Wrote $ENV_FILE (mode 600)."
