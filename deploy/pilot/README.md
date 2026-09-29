# The Pilot: runbook

The Pilot is a second, disposable service for real Requesters on the repo
owner's server (ADR 0022, spec §18.15, `CONTEXT.md`). It runs from the `pilot`
branch, which is never merged into `main`, on `personal-test-server`, and is
reached only through a Cloudflare Tunnel on the owner's domain. This file is
#101's runbook: first deploy, update, teardown.

Everything runs from a machine on the tailnet with `deploy/pilot/pipeline.sh`,
logged in to Docker Hub as `rawinan`. The image is built here from the committed
`pilot` branch, pushed to the public `rawinan/dds-sharing-pilot`, and pulled by
the server. **The server never holds the repository**: `~/dds-pilot` contains
only the two compose files, `docker/postgres-init/`, the `.env` written there,
and `release.env`, which names the deployed commit.

## Before the first deploy (once, by hand)

1. **Create the tunnel** in the Cloudflare dashboard (Zero Trust → Networks →
   Tunnels → Create, type *cloudflared*). Copy its **token**; you will paste it
   in step 2.
2. **Give it a public hostname** on your domain, e.g. `pilot.example.com`, with
   service **`http://app:3000`**. That is the app's name on the Compose network,
   so no port is published on the host. Add no Access policy: the Pilot is open
   to everyone (ADR 0022).
3. Have the relay account and the upstream token to hand.

## First deploy

Commit and push `pilot` first: every step deploys the committed branch.

```sh
deploy/pilot/pipeline.sh build    # 1. build pilot for linux/amd64, push rawinan/dds-sharing-pilot:<sha>
deploy/pilot/pipeline.sh env      # 2. on the server: type the URL, tunnel token, relay and upstream secrets
deploy/pilot/pipeline.sh compose  # 3. copy the compose files there, check them against that .env
deploy/pilot/pipeline.sh run      # 4. pull <sha>; start postgres, set the app role's password, start the rest
deploy/pilot/pipeline.sh check    #    the exposure checks below
```

Then seed yourself as the Pilot's one Reviewer (§17.5) and sign in with TOTP:

```sh
deploy/pilot/pipeline.sh dc exec app node dist/cli/reviewer.js seed --username <you> --email <you@…>
```

## What `check` proves, and what it cannot

`check` fails unless all of these hold:

- `/api/health` answers through the tunnel, with no insecure flag on;
- ports 3000, 3100, 5432, 6379, 9000 and 9001 are closed from the tailnet: the
  app, Bull Board, Postgres, Redis and MinIO (the sharp one: a reachable bucket
  bypasses the Download token and its audit);
- no container publishes a port beyond the server's loopback;
- the server's clock is NTP-synchronized (TOTP and the business-hours clock).

By hand, once, because they need a person:

- **Two Requesters on different IPs can each submit.** Duplicate suppression is
  keyed on the client IP (§4.8), so from a phone off wifi and from a laptop:
  each gets a `PLT-` reference. If the second is refused, `TRUST_PROXY` is wrong.
- **An end-to-end Request**: submit, approve, the Delivery email arrives through
  the real relay, the archive downloads against the real upstream.
- **The kill switch**: `pipeline.sh dc down`, and the URL stops answering.

## Updating

New work reaches the Pilot only through `pilot`. Merge `main` into `pilot`
(e.g. #96's flip), commit, then:

```sh
deploy/pilot/pipeline.sh all      # build, compose, run, check
```

`run` is safe to repeat: it re-applies the app role's password and restarts
only what changed. The image tag is the commit, and `release.env` on the server
names the one running. **Rolling back** runs an older image already on Docker
Hub: `PILOT_TAG=<sha> deploy/pilot/pipeline.sh run`.

## Operating

```sh
deploy/pilot/pipeline.sh dc ps
deploy/pilot/pipeline.sh dc logs app
ssh -L 3100:127.0.0.1:3100 personal-test-server   # Bull Board, loopback only
```

## Stopping and retiring

- **Stop serving data** (the kill switch): `deploy/pilot/pipeline.sh dc down`.
  The tunnel stops with it.
- **Retire the Pilot**: `deploy/pilot/pipeline.sh dc down --volumes`, then
  delete `~/dds-pilot` on the server, the tunnel in Cloudflare, and the
  `rawinan/dds-sharing-pilot` repository on Docker Hub. The Pilot's
  record is disposable and has no backup (ADR 0022): this deletes every trace of
  what it released.
