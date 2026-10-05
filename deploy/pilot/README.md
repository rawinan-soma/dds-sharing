# The Pilot: runbook

The Pilot is a second, disposable service for real Requesters on the repo
owner's server (ADR 0022, spec §18.15, `CONTEXT.md`). It runs from the `pilot`
branch, which is never merged into `main`, on a server named by `HOST`, and is
reached only through a Cloudflare Tunnel on the owner's domain. This file is
#101's runbook: first deploy, update, teardown. Its steps are the targets of
`deploy/pilot/Makefile`.

The image is built on a laptop from the committed `pilot` branch, pushed to the
public Docker Hub repository `rawinan/dds-sharing-pilot`, and pulled by the
server. **The server never holds the repository**: `~/dds-pilot` contains only
the two compose files, `docker/postgres-init/`, the `.env` written there, and
`release.env`, which names the deployed commit.

## Before the first deploy (once, by hand)

1. **Create the tunnel** in the Cloudflare dashboard (Zero Trust → Networks →
   Tunnels → Create, type *cloudflared*). Copy its **token**; you paste it in
   `pilot-dds-sharing env HOST=<host>`.
2. **Give it a public hostname** on your domain, e.g. `pilot.example.com`, with
   service **`http://app:3000`**. That is the app's name on the Compose network,
   so no port is published on the host. Add no Access policy: the Pilot is open
   to everyone (ADR 0022).
3. Have the relay account and the upstream token to hand.
4. On the laptop: `docker login` as `rawinan`, and commit `pilot` — every step
   below deploys the committed branch, never the working tree.

Every step below is a target of `deploy/pilot/Makefile`, run **from the
repository root on the laptop**. `make -C deploy/pilot` lists them, and
`make -C deploy/pilot -n <target>` prints the commands a target would run
without running them. Each target deploys the commit `TAG` (default: the tip
of `pilot`) on `HOST`, an SSH host the laptop can reach (e.g. a `Host` entry in
`~/.ssh/config`). `HOST` has no default and must be given on the command line
to every target but `build`, so no command reaches a server it did not name.

```sh
alias pilot-dds-sharing='make -C deploy/pilot'   # optional; the examples use it
```

## Once: the server's `.env`

```sh
pilot-dds-sharing env HOST=<host>
```

`write-env.sh` runs on the server without being copied there, so the secrets
are typed into the server and nowhere else. It asks for the Pilot URL, the
tunnel token, the relay account and the upstream token, and generates every
internal password. It refuses to overwrite an existing `.env`;
`pilot-dds-sharing env HOST=<host> FORCE=1` replaces it with new secrets. After this, no
deploy asks for a secret again.

## Deploy

```sh
pilot-dds-sharing deploy HOST=<host>
```

That is four steps, each also a target of its own:

1. **`build`**: `git archive` of the commit, built for `linux/amd64` and
   pushed as `rawinan/dds-sharing-pilot:<TAG>` and `:latest`. Untracked files
   cannot reach the image, and `.dockerignore` keeps any `.env` out.
2. **`sync`**: the compose files and `docker/postgres-init` at that commit,
   copied to `~/dds-pilot`; `release.env` pinned to `PILOT_TAG=<TAG>`; the
   config validated against `.env`. It stops first if there is no `.env` or
   the image is not on Docker Hub.
3. **`run`**: pull, start Postgres, replace the development password
   `docker/postgres-init` gives the application role, start the rest. Safe to
   repeat: it restarts only what changed.
4. **`check`**: runs every check below that needs no person, and fails if any
   fails.

After the first deploy, seed yourself as the Pilot's one Reviewer (§17.5) and
sign in with TOTP:

```sh
pilot-dds-sharing seed HOST=<host> USERNAME=<you> EMAIL=<you@…>
```

## Check

`pilot-dds-sharing check HOST=<host>` verifies (#101):

- `/api/health` answers through the tunnel, with `"insecureFlags": []`;
- the app, Bull Board, Postgres, Redis and MinIO (ports 3000, 3100, 5432, 6379,
  9000, 9001) are closed from the tailnet. MinIO is the sharp one: a reachable
  bucket bypasses the Download token;
- nothing is published beyond the server's loopback (only `127.0.0.1:3100`);
- the clock is synchronized (TOTP and the business-hours clock depend on it).

By hand, once, because they need a person:

- **Two Requesters on different IPs can each submit.** Duplicate suppression is
  keyed on the client IP (§4.8), so from a phone off wifi and from a laptop:
  each gets a `PLT-` reference. If the second is refused, `TRUST_PROXY` is wrong.
- **An end-to-end Request**: submit, approve, the Delivery email arrives through
  the real relay, the archive downloads against the real upstream.
- **The kill switch**: `pilot-dds-sharing down HOST=<host>`, and the URL stops answering.

## Updating and rolling back

New work reaches the Pilot only through `pilot`. Merge `main` into `pilot`
(e.g. #96's flip), commit, then `pilot-dds-sharing deploy HOST=<host>`. `release.env` on
the server names the commit running; `pilot-dds-sharing check HOST=<host>` prints it.

**Rolling back** is `pilot-dds-sharing rollback HOST=<host> TAG=<sha>`, for an older commit
whose image is already on Docker Hub. It syncs that commit's compose files too.

## Operating

```sh
pilot-dds-sharing ps HOST=<host>
# cloudflared, and the app's latest hour file under /logs (§14.5)
pilot-dds-sharing logs HOST=<host>
# Bull Board at http://localhost:3100, loopback only
pilot-dds-sharing board HOST=<host>
# any compose command on the server
pilot-dds-sharing dc HOST=<host> ARGS="restart app"
```

## Stopping and retiring

- **Stop serving data** (the kill switch): `pilot-dds-sharing down HOST=<host>`. The tunnel
  stops with it.
- **Retire the Pilot**: `pilot-dds-sharing retire HOST=<host>` asks you to type a
  confirmation, then deletes the volumes and `~/dds-pilot` on the server. Then
  delete the tunnel in Cloudflare and the `rawinan/dds-sharing-pilot`
  repository on Docker Hub. The Pilot's record is disposable and has no backup
  (ADR 0022): this deletes every trace of what it released.
