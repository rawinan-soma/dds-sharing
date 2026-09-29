# The Pilot: runbook

The Pilot is a second, disposable service for real Requesters on the repo
owner's server (ADR 0022, spec §18.15, `CONTEXT.md`). It runs from the `pilot`
branch, which is never merged into `main`, on `personal-test-server`, and is
reached only through a Cloudflare Tunnel on the owner's domain. This file is
#101's runbook: first deploy, update, teardown.

The image is built on a laptop from the committed `pilot` branch, pushed to the
public Docker Hub repository `rawinan/dds-sharing-pilot`, and pulled by the
server. **The server never holds the repository**: `~/dds-pilot` contains only
the two compose files, `docker/postgres-init/`, the `.env` written there, and
`release.env`, which names the deployed commit.

## Before the first deploy (once, by hand)

1. **Create the tunnel** in the Cloudflare dashboard (Zero Trust → Networks →
   Tunnels → Create, type *cloudflared*). Copy its **token**; you paste it in
   step 2.
2. **Give it a public hostname** on your domain, e.g. `pilot.example.com`, with
   service **`http://app:3000`**. That is the app's name on the Compose network,
   so no port is published on the host. Add no Access policy: the Pilot is open
   to everyone (ADR 0022).
3. Have the relay account and the upstream token to hand.
4. On the laptop: `docker login` as `rawinan`, and commit `pilot` — every step
   below deploys the committed branch, never the working tree.

Every command below runs **from the repository root on the laptop**, after:

```sh
HOST=personal-test-server
TAG=$(git rev-parse --short pilot)     # or an older commit, to roll back
D='~/dds-pilot'
DC="docker compose --project-name dds-pilot --env-file $D/.env --env-file $D/release.env -f $D/docker-compose.yml -f $D/compose.pilot.yml"
```

`$DC` is expanded here and runs on the server, where `~` is the server's home.

## 1. Build and push the image

From the committed `pilot` tree, for the server's architecture. Untracked files
cannot reach the image, and `.dockerignore` keeps any `.env` out.

```sh
git archive --format=tar pilot |
  docker buildx build --platform linux/amd64 \
    -t rawinan/dds-sharing-pilot:$TAG -t rawinan/dds-sharing-pilot:latest --push -
```

## 2. Write the server's `.env` (once)

`write-env.sh` runs on the server without being copied there, so the secrets
are typed into the server and nowhere else. It asks for the Pilot URL, the
tunnel token, the relay account and the upstream token, generates every
internal password, and refuses to overwrite an existing `.env` (add `--force`
after `write-env.sh` to replace it).

```sh
ssh -t $HOST "bash -c $(printf '%q' "$(cat deploy/pilot/write-env.sh)") write-env.sh"
```

## 3. Copy the compose files

```sh
git archive --format=tar pilot docker-compose.yml compose.pilot.yml docker/postgres-init |
  ssh $HOST 'mkdir -p ~/dds-pilot && tar -x -C ~/dds-pilot'
ssh $HOST "echo PILOT_TAG=$TAG > ~/dds-pilot/release.env && $DC config --quiet && echo config ok"
```

## 4. Run

Pull the tagged image, start Postgres, replace the development password
`docker/postgres-init` gives the application role, then start the rest.

```sh
ssh $HOST "echo PILOT_TAG=$TAG > ~/dds-pilot/release.env && $DC pull app cloudflared && $DC up -d --wait postgres"
ssh $HOST "set -a && . ~/dds-pilot/.env && echo \"ALTER ROLE dds_app_login PASSWORD :'pw';\" | $DC exec -T postgres psql -q -U postgres -d dds_sharing -v ON_ERROR_STOP=1 -v pw=\"\$APP_DB_PASSWORD\""
ssh $HOST "$DC up -d --remove-orphans && $DC ps"
```

Then seed yourself as the Pilot's one Reviewer (§17.5) and sign in with TOTP:

```sh
ssh -t $HOST "$DC exec app node dist/cli/reviewer.js seed --username <you> --email <you@…>"
```

## Check

Each of these must hold (#101):

```sh
# /api/health answers through the tunnel, and "insecureFlags" is []
curl -fsS "$(ssh $HOST "grep '^FRONTEND_URL=' ~/dds-pilot/.env | cut -d= -f2-")/api/health"

# the app, Bull Board, Postgres, Redis and MinIO are closed from the tailnet
# (MinIO is the sharp one: a reachable bucket bypasses the Download token)
for p in 3000 3100 5432 6379 9000 9001; do nc -z -w 3 $HOST $p && echo "OPEN $p" || echo "closed $p"; done

# nothing is published beyond the server's loopback (expect only 127.0.0.1:3100)
ssh $HOST "$DC ps --format '{{.Service}} {{.Ports}}'"

# the clock is synchronized (TOTP and the business-hours clock depend on it)
ssh $HOST 'timedatectl show -p NTPSynchronized --value'
```

By hand, once, because they need a person:

- **Two Requesters on different IPs can each submit.** Duplicate suppression is
  keyed on the client IP (§4.8), so from a phone off wifi and from a laptop:
  each gets a `PLT-` reference. If the second is refused, `TRUST_PROXY` is wrong.
- **An end-to-end Request**: submit, approve, the Delivery email arrives through
  the real relay, the archive downloads against the real upstream.
- **The kill switch**: `ssh $HOST "$DC down"`, and the URL stops answering.

## Updating and rolling back

New work reaches the Pilot only through `pilot`. Merge `main` into `pilot`
(e.g. #96's flip), commit, then set `TAG` again and repeat steps 1, 3 and 4.
Step 4 is safe to repeat: it re-applies the role's password and restarts only
what changed. `release.env` on the server names the commit running.

**Rolling back** is steps 3 and 4 with `TAG` set to an older commit whose image
is already on Docker Hub.

## Operating

```sh
ssh $HOST "$DC ps"
ssh $HOST "$DC logs cloudflared"
# the app logs to hour files under /logs, not to Docker (spec §14.5)
ssh $HOST "$DC exec app sh -c 'tail -n 100 \$(ls -t /logs/* | head -1)'"
ssh -L 3100:127.0.0.1:3100 $HOST      # Bull Board, loopback only
```

## Stopping and retiring

- **Stop serving data** (the kill switch): `ssh $HOST "$DC down"`. The tunnel
  stops with it.
- **Retire the Pilot**: `ssh $HOST "$DC down --volumes"`, then delete
  `~/dds-pilot` on the server, the tunnel in Cloudflare, and the
  `rawinan/dds-sharing-pilot` repository on Docker Hub. The Pilot's record is
  disposable and has no backup (ADR 0022): this deletes every trace of what it
  released.
