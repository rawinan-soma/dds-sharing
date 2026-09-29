# The Pilot: runbook

The Pilot is a second, disposable service for real Requesters on the repo
owner's server (ADR 0022, spec §18.15, `CONTEXT.md`). It runs from the `pilot`
branch, which is never merged into `main`, on `personal-test-server`, and is
reached only through a Cloudflare Tunnel on the owner's domain. This file is
#101's runbook: first deploy, update, teardown.

Everything runs from a machine on the tailnet with `deploy/pilot/pipeline.sh`.
On the server, `~/dds-pilot/src` is a clone of `pilot` and `~/dds-pilot/.env`
holds the secrets, outside the clone.

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

```sh
deploy/pilot/pipeline.sh build    # 1. clone `pilot` on the server, build dds-sharing-pilot:<sha>
deploy/pilot/pipeline.sh env      # 2. type the URL, tunnel token, relay and upstream secrets
deploy/pilot/pipeline.sh config   # 3. check compose.pilot.yml against that .env
deploy/pilot/pipeline.sh run      # 4. start: postgres, the app role's password, then the rest
deploy/pilot/pipeline.sh check    #    the exposure checks below
```

Then seed yourself as the Pilot's one Reviewer (§17.5) and sign in with TOTP:

```sh
deploy/pilot/pipeline.sh compose exec app node dist/cli/reviewer.js seed --username <you> --email <you@…>
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
- **The kill switch**: `pipeline.sh compose down`, and the URL stops answering.

## Updating

New work reaches the Pilot only through `pilot`. Merge `main` into `pilot`
(e.g. #96's flip), push, then:

```sh
deploy/pilot/pipeline.sh all      # build, config, run, check
```

`run` is safe to repeat: it re-applies the app role's password and restarts
only what changed. The image tag is the commit (`docker images dds-sharing-pilot`).

## Operating

```sh
deploy/pilot/pipeline.sh compose ps
deploy/pilot/pipeline.sh compose logs app
ssh -L 3100:127.0.0.1:3100 personal-test-server   # Bull Board, loopback only
```

## Stopping and retiring

- **Stop serving data** (the kill switch): `deploy/pilot/pipeline.sh compose down`.
  The tunnel stops with it.
- **Retire the Pilot**: `deploy/pilot/pipeline.sh compose down --volumes`, then
  delete `~/dds-pilot` on the server and the tunnel in Cloudflare. The Pilot's
  record is disposable and has no backup (ADR 0022): this deletes every trace of
  what it released.
