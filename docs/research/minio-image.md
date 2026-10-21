# Which MinIO image the port and Production should name

- **Question:** `minio/minio:latest` no longer pulls. Which S3-compatible image should the Gleam port's compose, and Production's first deploy, name? Does the Pilot's existing volume stay readable? (#151, map #132)
- **Date:** 2026-10-21
- **Builds on:** [004-object-storage-image.md](004-object-storage-image.md) (2026-09-29, #101), which compared 14 options and moved the Pilot to `pgsty/silo`. This note re-checks the live facts three weeks later, tests the two MinIO forks against the app's real S3 calls, and answers the volume question. Read 004 for the options it already ruled out (Garage, RustFS, SeaweedFS, versitygw, CloudServer, Ceph, AIStor Free, `dhi.io`, CleanStart).
- **Method:** registry APIs and `docker buildx imagetools inspect` with an empty `DOCKER_CONFIG` (no login), `gh api` on the GitHub repos, the vendors' own docs, and a local probe that runs the app's `minio` client (`apps/api/node_modules/minio`, ^8.0.7) against each image. ⚠️ marks what was not verified.

## Answer

**Name `docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7`** in the base compose, with the same `command`, env and `minio-data` volume as today. Then the Pilot override needs no `minio.image` line.

Why:

1. It is what the Pilot already runs (`compose.pilot.yml`, commit `c734dff`, 2026-09-29). The Pilot's volume needs no change and no `chown`.
2. It has exact, dated release tags **and** the release notes print the digest, free and with no login. Chainguard's free tier has only `latest`.
3. It is the most active MinIO fork: releases on 2026-09-16, 2026-10-15 (image only) and 2026-10-18, commits up to today. Chainguard's fork has had no commit since 2026-09-22.
4. Lifecycle (`Expiration.Days` with `Filter.Prefix`) and ranged GET work with the app's client (probe below).

**Fallback:** `cgr.dev/chainguard/minio` pinned by digest. It also works, but needs `user: "0"` (or a `chown -R 65532` of the volume), and only `latest` is tagged.

## What the app needs from the store

From `apps/api/src/extraction/archive-store.ts` and `bucket-lifecycle.ts` (unchanged since 004): `bucketExists`, `makeBucket`, `setBucketLifecycle` (one rule: `Expiration: { Days: 3 }`, `Filter: { Prefix: '' }`), `putObject`, `statObject`, `getObject`, `getPartialObject` (Range), `removeObject`. No presigned URLs: downloads are proxied through the API. The app signs in with the root user (`MINIO_ROOT_USER` = `MINIO_ACCESS_KEY`, `docker-compose.yml`).

The lifecycle rule is only a backstop, but its comment depends on expiry being counted **in whole days from object creation**. Silo and Chainguard both keep MinIO's lifecycle code, so this holds as before. ⚠️ Not re-proved here (it would take 3 days).

## Facts, checked 2026-10-21

| | `pgsty/silo` | `cgr.dev/chainguard/minio` | Build from source |
|---|---|---|---|
| Licence | AGPL-3.0-or-later (`gh repo view pgsty/silo`); README promises "no license change, no CLA" | AGPLv3 (`minio --version` in the image) | AGPLv3 |
| Source | `github.com/pgsty/silo`, fork of `minio/minio`, not archived, last push 2026-10-21 | `github.com/chainguard-forks/minio`, last commit 2026-09-22 ("reject unsigned x-amz-* headers…") | `minio/minio` is archived; last tag `RELEASE.2025-10-15T17-29-55Z`. Or build a fork's tag |
| Cadence | GitHub releases 2026-08-04, 08-06, 09-03, 09-16, 10-18; Hub also has `RELEASE.2026-10-15T00-00-00Z` with no GitHub release | Image rebuilt nightly (created 2026-10-20T14:12Z), but the server is still `RELEASE.2026-09-22T19-25-18Z (commit-id=df34868a…)` | We own every rebuild |
| Free pinning | Dated tags on Docker Hub, each with `-distroless`, `-amd64`, `-arm64` variants. The release notes list the digest. | Tag list (`GET cgr.dev/v2/chainguard/minio/tags/list`) has only `latest` and `latest-dev`. Older digests still return 200 (two spot-checked), ⚠️ but nothing promises they stay | Our own registry |
| Anonymous pull | ✅ | ✅ | n/a |
| Arch | amd64 + arm64 | amd64 + arm64 | build both |
| Runs as | root (no `User` in config); entrypoint `/usr/bin/docker-entrypoint.sh`, cmd `silo` | UID 65532; entrypoint `/usr/bin/minio` | our choice |
| Our `server /data --console-address ":9001"` | ✅ (entrypoint maps the args) | ✅ | ✅ |
| Lifecycle + Range (probe) | ✅ | ✅ (with `user: "0"`) | ✅ (same code) ⚠️ not probed |

Not options (re-checked today, anonymous):

- `minio/minio:latest`: `pull access denied … insufficient_scope`.
- `quay.io/minio/minio:latest`: `401 Unauthorized`.
- `bitnami/minio:latest`: `not found`. `bitnamilegacy/minio` still pulls but is frozen since 2025-08 (see 004).
- Garage: its lifecycle only does `Expiration` and `AbortIncompleteMultipartUpload` (enough for our rule), but it needs a new config, port, region and a data copy. See 004. Not worth it while a drop-in fork exists.

## Probe: the app's own client against each image

Script: the app's `minio` client does `makeBucket`, `setBucketLifecycle` (the real rule), `putObject` of 16 bytes, then `getBucketLifecycle`, `statObject`, `getPartialObject(offset 4, length 6)` and `getObject`. Each image runs with our compose's `server /data --console-address ":9001"` and root-user env, on one shared named volume, in this order:

| Step | Image | Result |
|---|---|---|
| 1 | `pgsty/silo:RELEASE.2026-09-16T00-00-00Z` (the Pilot's version) writes | lifecycle read back as set; size 16; range `456789` ✅; whole object ✅ |
| 2 | `pgsty/silo:RELEASE.2026-10-18T00-00-00Z` reads the same volume | same results ✅ |
| 3 | `cgr.dev/chainguard/minio:latest` reads the same volume | **exits at start**: "Please ensure MinIO binary has write permissions for the backend … `chown -R nonroot`" |
| 4 | the same, with `--user 0` | same results as step 1 ✅ |

The container and volume were removed afterwards.

## Does the Pilot's volume stay readable?

**Yes, for both forks. Only Chainguard needs a change to user or ownership.**

- Silo's README: *"Silo preserves S3 and storage-format compatibility, including existing `MINIO_*` variables … and `.minio.sys` data."* Its compatibility audit (https://silo.pgsty.com/compatibility/server/) says *"disk formats and established configuration names are unchanged"* and *"Silo reads existing disks in place"*. Its migration guide (https://silo.pgsty.com/compatibility/migration/) shows the same compose service with `minio-data:/data # same volume, same data`. Probe step 2 confirms a 09-16 → 10-18 upgrade on one volume.
- The Pilot volume was written by a root-run image (`pgsty/silo`, or briefly `dhi.io/minio` if that commit was ever deployed; ⚠️ the server itself was not inspected). Chainguard runs as 65532, so step 3 fails until it runs as root or the volume is `chown`ed. Data format is fine (step 4).
- One-way caution from Silo's migration page: *"Compatible object layouts do not guarantee that old software understands new bucket configuration, IAM revisions or deletion history"*, and rollback needs the old image digest kept. For us this matters little: the bucket holds only Extracts that live 72 hours, one lifecycle rule, and the root user.

## Licence and what DDC allows

- All candidates are AGPLv3. We run the server unmodified, as a separate container, reachable only by the app on the Compose network. AGPL's network clause (§13) binds those who **modify** the program, so running it as is adds no duty for us. This is the same position as running upstream MinIO.
- Spec §17.4 gives the DDC infra team the VM and the edge route, and gives the service owner "the VM's Docker host, the application, everything from the TCP connection inward". It names no allowed registry, licence or image source. So the image is the service owner's choice. ⚠️ Not checked: whether the Production VM can reach `docker.io` (or `cgr.dev`) outbound. If it cannot, the image must be loaded by `docker save`/`load`, and the digest pin still applies.
- §17.4's requirement that MinIO is unreachable from outside is a network matter (no published port, host firewall). It does not depend on the image.

## Risks

- **A one-team fork.** Silo is run by Pigsty (PGSTY), who use it for their own Postgres backups. If it stops, the fallback is Chainguard's fork, which reads the same volume (probe step 4). Pinning by digest means a stopped fork never breaks a deploy; it only stops fixes.
- **Silo changes behaviour on purpose sometimes.** The 2026-10-18 notes say *"Authorization fixes can reject previously permitted operations"* and add a retryable `503 SlowDownWrite`. The app uses the root user, and the probe passed, but read the release notes before each bump and run the e2e suite.
- **Chainguard pins are weak on the free tier.** Only `latest`; old digests seem kept but this is not promised.
- **Docker Hub anonymous pull limits** apply to `pgsty/silo` (per-IP rate limit). One pull per deploy is far below it.

## Sources

| Source | What it gave |
|---|---|
| `compose.pilot.yml`, `docker-compose.yml`, `git log` (`c734dff`, `b07a821`, 2026-09-29) | Pilot runs `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`; base still names `minio/minio:latest`; the switch date |
| `apps/api/src/extraction/{archive-store,bucket-lifecycle}.ts` | S3 calls the app makes; the 3-day rule |
| `docs/spec.md` §17.4 | Who owns what; no image rule |
| `hub.docker.com/v2/repositories/pgsty/silo/tags` | Tags and digests, incl. `RELEASE.2026-10-18T00-00-00Z` → `sha256:2636fc41…` |
| `gh api repos/pgsty/silo/{releases,commits,readme}`; `gh repo view pgsty/silo` | Releases, notes, digest, licence, compatibility claims |
| https://silo.pgsty.com/compatibility/server/, https://silo.pgsty.com/compatibility/migration/ | Disk format unchanged; in-place reads; rollback caveats |
| `GET https://cgr.dev/v2/chainguard/minio/tags/list` (anonymous token); manifest HEAD by digest | Only `latest`/`latest-dev`; old digests still 200 |
| `docker run cgr.dev/chainguard/minio:latest --version` | `RELEASE.2026-09-22T19-25-18Z`, AGPLv3 |
| `gh api repos/chainguard-forks/minio/{tags,commits}` | Fork's last tag and commit (2026-09-22) |
| `docker buildx imagetools inspect` (empty `DOCKER_CONFIG`) | Anonymous pull, arch, user, entrypoint; the failures for `minio/minio`, `quay.io/minio/minio`, `bitnami/minio` |
| Local probe with the app's `minio` client | Lifecycle, Range, whole GET, volume handover |
