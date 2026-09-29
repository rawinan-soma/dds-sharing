# Which object-storage image to run now that `minio/minio` is gone

- **Question:** `minio/minio` is no longer published. Which image should the `minio` service in `docker-compose.yml` / `compose.pilot.yml` run instead: a MinIO build, or an S3-compatible alternative?
- **Issue:** #101
- **Date:** 2026-09-29
- **Primary sources:** GitHub repos, READMEs and release APIs (`gh api repos/<owner>/<repo>/...`), registry manifests (`docker buildx imagetools inspect`, with an empty `DOCKER_CONFIG` so nothing is authenticated), the Docker Hub tags API (`hub.docker.com/v2/repositories/<repo>/tags`), the project docs linked in each section, and this repo's code. Every claim carries its source; ⚠️ marks what was not verified.

## Answer

**Run `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, pinned by tag.** It is a maintained, AGPLv3 fork of MinIO's server. It is free to pull without login, built for amd64 and arm64, and published with dated release tags about monthly. It says it keeps MinIO's `MINIO_*` env vars and `.minio.sys` on-disk format, and its documented `docker run` uses the same `server /data --console-address ":9001"` command as ours. That makes it a one-line `image:` change with no data migration. It also removes the `dhi.io` login and the paid ELS entitlement that `compose.pilot.yml` now depends on.

**Fallback:** `cgr.dev/chainguard/minio`. Chainguard builds it nightly from its own maintained MinIO fork (it reports `RELEASE.2026-09-22T19-25-18Z`). The free tier only publishes the `latest` / `latest-dev` tags, and the image runs as UID 65532, so our root-owned `minio-data` volume would need a `chown`.

**Non-MinIO option:** Garage `dxflrs/garage:v2.4.1`. Its lifecycle support covers exactly our rule (`Expiration.Days` with `Filter.Prefix`). Since v2.3.0 it bootstraps a single node from env vars. It is the only candidate here that does not depend on a MinIO fork staying alive. Switching costs more than the other two: new port, a `garage.toml`, a region setting, and a data copy.

Whatever we choose, the S3 surface to re-test is small (see below). No presigned URLs are involved, so the requirement that "the Download token is the only way in" does not depend on which server we pick.

## What the app actually needs

Read from `apps/api/src/extraction/archive-store.ts` and `bucket-lifecycle.ts`, plus their call sites in `delivery/delivery.service.ts`, `scheduler/tick.ts` and `extraction/extraction-worker.ts`:

| S3 operation | minio-js call | Used for |
|---|---|---|
| HeadBucket / CreateBucket | `bucketExists`, `makeBucket(bucket)` | `prepareExtractBucket` at startup (tick) |
| PutBucketLifecycleConfiguration | `setBucketLifecycle` | one rule: `Expiration: { Days: 3 }`, `Filter: { Prefix: '' }`. The comment relies on expiry being counted **in whole days from object creation, rounded up** |
| PutObject (single call from a `Buffer`) | `putObject(…, 'application/zip')` | upload the finished Extract |
| HeadObject | `statObject` | size, and a `NotFound` code means "deleted" |
| GetObject, whole and **byte-range** | `getObject`, `getPartialObject` | streamed to the client **through the API** |
| DeleteObject | `removeObject` | expiry at the token's deadline |

`grep -rn presign apps packages` finds nothing. Objects are **proxied** by `DeliveryService` and never handed out by URL, so the bucket needs no public or network exposure beyond the app. The client is `minio` `^8.0.7` (`apps/api/package.json`). Its config is endpoint, port, SSL flag and key pair only (`config/env.schema.ts` `minioGroup`), with no region setting.

## What MinIO changed (primary: `github.com/minio/minio`)

- **2025-10-15**, commit `9e49d5e7` ("update README.md and other docs to point to source only releases"): *"The MinIO community edition is now distributed as source code only. We will no longer provide pre-compiled binary releases for the community version."* The last GitHub release is `RELEASE.2025-10-15T17-29-55Z` (`gh api repos/minio/minio/releases`).
- **2025-12-03**, `27742d46`: "Maintenance Mode": *"No new features, enhancements, or pull requests will be accepted … Critical security fixes may be evaluated on a case-by-case basis."*
- **2026-01-06**, `be7800c8`: the README points to **AIStor Free** (free license key) and AIStor Enterprise. On 2025-12-23 MinIO's blog introduced the tiers: AIStor Free is a *"single-node deployment"* whose license *"limits any redistribution or resale"* (https://min.io/blog/introducing-new-subscription-tiers-for-minio-aistor-free-enterprise-lite-and-enterprise).
- **2026-02-12**, `7aac2a2c`: *"THIS REPOSITORY IS NO LONGER MAINTAINED."* The repo is now **archived** (`gh repo view minio/minio` → `isArchived: true`, last push 2026-04-24). ⚠️ The archive date itself is not exposed by the API.
- Registries, checked 2026-09-29: `docker.io/minio/minio` (any tag) gives *pull access denied*, and `quay.io/minio/minio:latest` gives **401**.

## Comparison

| Option | Maintainer / licence | Anonymous pull | amd64+arm64 | Pinnable tags, cadence | Lifecycle `Expiration.Days` | Migration from current compose |
|---|---|---|---|---|---|---|
| **`pgsty/silo`** ✅ | Pigsty (PGSTY), AGPLv3 fork | ✅ | ✅ | `RELEASE.2026-09-16T00-00-00Z`, `-09-03`, `-08-06`; ~monthly | ✅ (MinIO code) | image line only; same env, command and data format |
| `pgsty/minio` | same, **frozen** | ✅ | ✅ | last tag `RELEASE.2026-08-04T00-00-00Z` | ✅ | image line only, but gets no updates (renamed) |
| `cgr.dev/chainguard/minio` | Chainguard, AGPLv3 (own fork) | ✅ | ✅ | **free tier: `latest`, `latest-dev` only**; rebuilt nightly | ✅ | image line + chown of the volume (UID 65532) |
| `cleanstart/minio` | CleanStart, AGPLv3 | ✅ | ✅ | one version tag `0.20260330.001845`, **rewritten daily**; build unstamped | ✅ | image line + chown of the volume (UID 65532); failed on a fresh volume in testing |
| `bitnamilegacy/minio` | Broadcom/Bitnami, **frozen** | ✅ | ✅ | last `2025.7.23-debian-12-r5` (2025-08-19); `latest` = 2025.5.24 | ✅ | different env/paths (Bitnami layout) ⚠️ |
| `dhi.io/minio` | Docker, AGPLv3 ELS rebuild | ❌ 401 | ✅ | paid ELS entitlement | ✅ | what `compose.pilot.yml` uses now; needs login and an entitlement |
| Self-build from `RELEASE.2025-10-15T17-29-55Z` | us, AGPLv3 | n/a | build both | frozen upstream, no fixes | ✅ | a Dockerfile + CI job to own |
| `quay.io/minio/aistor/minio` (AIStor Free) | MinIO Inc., **proprietary** | ✅ image, but needs a license file | ✅ | `RELEASE.2026-09-19T17-05-25Z` etc. | ✅ | image + `--license` file + licence review |
| **Garage** `dxflrs/garage` | Deuxfleurs, AGPLv3 | ✅ | ✅ | `v2.4.1` (2026-09-08), `v2.4.0`, `v2.3.0` | ✅ Days + Filter.Prefix only | new port 3900, `garage.toml`, region, data copy |
| RustFS `rustfs/rustfs` | RustFS, Apache-2.0 | ✅ | ✅ | `1.0.0` (GA 2026-09-16); previews weekly | ✅ "Available" | new env names, UID 10001, data copy |
| SeaweedFS `chrislusf/seaweedfs` | Chris Lu, Apache-2.0 | ✅ | ✅ | `4.48` (2026-09-28); ~weekly | ✅ listed (no Transition) | several components (master/volume/filer/s3) |
| versitygw `versity/versitygw` | Versity, Apache-2.0 | ✅ | ✅ | `v1.8.0` (2026-09-04); ~monthly | ❌ **NotImplemented** | disqualified: `prepareBucket` would fail |
| Zenko CloudServer | Scality, Apache-2.0 | ✅ `ghcr.io/scality/cloudserver:9.3.21` | ❌ amd64 only | `9.3.x`, `9.4.x` | ⚠️ stores the rule; expiry is run by Backbeat | disqualified for arm64 dev laptops |
| Ceph RGW | Ceph, LGPL | ✅ `quay.io/ceph/ceph:v19` | ✅ | `v19` | ✅ | disproportionate; the single-container `ceph/demo` repo is archived |

## MinIO image options

### `docker.io/pgsty/silo` (recommended)

- *"An independent, community-maintained fork of the open-source MinIO server, published by Pigsty … not affiliated with … MinIO, Inc."* *"Pigsty runs it in production as its PostgreSQL backup repository."* The licence is AGPL-3.0-or-later (`gh api repos/pgsty/silo/readme`; `gh repo view pgsty/silo`).
- The repo was **renamed from `pgsty/minio` to `pgsty/silo` on 2026-08-06**. Artifacts under the MinIO name stop at `RELEASE.2026-08-04T00-00-00Z` (same README). That matches the Docker Hub tags: `pgsty/minio` newest tag is 2026-08-04, while `pgsty/silo` has `RELEASE.2026-08-06…`, `…-09-03T13-18-01Z` and `…-09-16T00-00-00Z`, each also in a `-distroless` variant (Hub tags API). GitHub releases follow the same dates (`gh api repos/pgsty/minio/releases`).
- Anonymous pull with `linux/amd64` + `linux/arm64` confirmed (`imagetools inspect docker.io/pgsty/silo:latest`). The config is `Entrypoint ["/usr/bin/docker-entrypoint.sh"]`, `Cmd ["silo"]`, `Volumes {"/data"}`, and no `User`, i.e. root like upstream, so the existing `minio-data` volume's ownership still works.
- Compatibility claim, quoted: *"Silo preserves S3 and storage-format compatibility, including existing `MINIO_*` variables … and `.minio.sys` data."* The README quick start is `docker run … -e MINIO_ROOT_USER … -e MINIO_ROOT_PASSWORD … docker.io/pgsty/silo:latest server /data --console-address ":9001"`, the same shape as our compose. Caveats in the same README: *"no `minio` server binary alias is installed"* (irrelevant to us, since we pass arguments to the entrypoint), and *"Treat each release as a downstream upgrade: pin versions."*
- ⚠️ Not tested here: that `setBucketLifecycle` and ranged GET behave as upstream under Silo. It is the same codebase, but run the e2e suite against it before switching.

### `cgr.dev/chainguard/minio`

- The registry tag list, fetched anonymously, holds only `latest` and `latest-dev` (`GET https://cgr.dev/v2/chainguard/minio/tags/list`). Asking for a dated tag returns `not found`. Created 2026-09-28T23:02Z; `User 65532`; `Entrypoint ["/usr/bin/minio"]`; amd64 + arm64 (`imagetools inspect`).
- `minio --version` in the image prints **`RELEASE.2026-09-22T19-25-18Z (commit-id=df34868a88cc…)`**. That commit is on **`github.com/chainguard-forks/minio`**, a maintained AGPLv3 fork whose README says: *"a supported replacement of the original minio repository … best-effort attempt to address publicly known security vulnerabilities"*. Its last commit is 2026-09-22, *"fix: reject unsigned x-amz-\* headers in Signature V4 verification"*.
- Downsides: we cannot pin a version tag on the free tier. A digest pin is possible, ⚠️ but whether Chainguard keeps old free-tier digests pullable was not verified. The non-root UID means the root-owned `minio-data` volume from `minio/minio` needs a `chown -R 65532` or a `user:` override.

### `cleanstart/minio` (added at the repo owner's request)

- **Maintainer / registry:** CleanStart, `docker.io/cleanstart/minio`, described as *"Hardened Container Images on a minimal base CleanStart OS"*, with 110k pulls (`hub.docker.com/v2/repositories/cleanstart/minio/`). CleanStart's catalog marks it **Free** and lists `latest` / `latest-dev` under a `cleanstartos/minio` path with no update cadence stated (https://images.cleanstart.com/images/minio/details).
- **Licence:** the image label reads `org.opencontainers.image.licenses: AGPL-3.0-or-later`, and `minio --version` prints *"License: GNU AGPLv3"*. ⚠️ No licence is stated for CleanStart's own base OS layers.
- **Anonymous pull, arch:** ✅. `linux/amd64` + `linux/arm64/v8` (`imagetools inspect cleanstart/minio:0.20260330.001845` with an empty config).
- **Tags and cadence:** only four non-digest tags exist: `latest`, `latest-dev`, `0.20260330.001845` and `0.20260330.001845-dev`, plus per-arch variants. There is no older version tag, and the single version tag was **re-pushed 2026-09-29** (Hub tags API, `last_updated`). The version tag is therefore effectively mutable, and only a digest pin is truly fixed.
- **Which MinIO:** `minio --version` prints `DEVELOPMENT.GOGET (commit-id=DEVELOPMENT.GOGET)`, so the build carries no release stamp. Its stack traces show module paths `github.com/chainguard-forks/minio/...`: it is built from **Chainguard's fork**, not from `minio/minio`. ⚠️ The version string `0.20260330.001845` does not match any tag in that fork (`RELEASE.2026-06-04…`, `…-07-17…`, `…-09-21…`, `…-09-22…`), so which fork commit it contains cannot be determined.
- **Compatibility with our service:** `Entrypoint ["/usr/bin/minio"]`, so `server /data --console-address ":9001"` passes straight through (as with Chainguard). But it runs as **`User 65532`**. Run with our exact command, env and a **fresh named volume**, it **exited immediately**: *"unable to create (/data/.minio.sys/tmp) file access denied"* (local probe on 2026-09-29; container and volume removed afterwards). It needs a `user:` override or an init `chown`, and the same applies to the existing root-owned `minio-data`.
- **Production readiness:** the Hub page calls it *"designed for secure production deployments"* and *"Production-ready"*. That is a marketing claim with no support statement, changelog or source repo for the image found.
- **Verdict: it does not change the recommendation.** It carries the same fork as `cgr.dev/chainguard/minio` but with less provenance: an unstamped build, a version tag that is rewritten, and no published release line. It has the same non-root volume problem. Silo is ahead on every criterion we care about (dated immutable tags, root-compatible with our volume, a public changelog).

### Others

- **`bitnamilegacy/minio`:** Bitnami stopped publishing to Docker Hub on 2025-08-28 and moved existing images to `bitnamilegacy`, where they are not updated (bitnami/containers#83267, "Upcoming changes to the Bitnami catalog"). The newest tag is `2025.7.23-debian-12-r5` (2025-08-19). `latest` is older still: built 2025-06-06, version label `2025.5.24` (`imagetools inspect`). It is frozen with known age, and ⚠️ Bitnami's env/volume layout differs from upstream's (not checked).
- **`dhi.io/minio`:** anonymous `curl -I https://dhi.io/v2/minio/manifests/latest` returns **401**. The catalog page (https://hub.docker.com/hardened-images/catalog/dhi/minio) says it needs an ELS entitlement. This laptop's keychain holds a `dhi.io` credential (`docker-credential-osxkeychain list`), which is why `buildx imagetools inspect` resolves it locally. The last commit on `pilot` (`b07a821`) points `compose.pilot.yml` at it.
- **Self-build:** upstream documents `go install github.com/minio/minio@latest` or building the repo's Dockerfile (README, "Source-Only Distribution"). The last upstream tag is `RELEASE.2025-10-15T17-29-55Z`, and the repo is archived, so a self-build freezes us there with no security fixes. Building from `chainguard-forks/minio` tags (latest `RELEASE.2026-09-22T19-25-18Z`) avoids the freeze, but we would then own a Go build and a registry.
- **AIStor Free:** `quay.io/minio/aistor/minio` returns manifests anonymously (HTTP 200, amd64+arm64), with tags up to `RELEASE.2026-09-19T17-05-25Z`. It is proprietary (*"MinIO Software License. An active license is required"*), and the licence file goes in via `--license /minio.license`. The free tier is *"a single compute resource … do not include support"* (https://docs.min.io/enterprise/aistor-object-store/installation/container/install/). It works technically, but it adds a licence file and a proprietary licence that would need review.

## S3-compatible alternatives

### Garage

- Deuxfleurs, AGPLv3. Deuxfleurs has *"been using it in production since its first release in 2020"* (https://git.deuxfleurs.fr/Deuxfleurs/garage, README on `main-v2`). Releases: `v2.4.1` 2026-09-08, `v2.4.0` 2026-09-06, `v2.3.0` 2026-04-16 (Gitea releases API). `dxflrs/garage:v2.4.1` covers amd64/arm64/386/arm (`imagetools inspect`).
- S3 coverage (https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/): CreateBucket, HeadBucket, PutObject, HeadObject, GetObject and DeleteObject are implemented. PutBucketLifecycleConfiguration is *"Partially implemented … The only actions supported are `AbortIncompleteMultipartUpload` and `Expiration`"*, with `Filter.Prefix` supported. That is exactly our rule. ⚠️ Not verified: that Garage's expiry is day-granular and never early, the property `bucket-lifecycle.ts` depends on.
- Single node (https://garagehq.deuxfleurs.fr/documentation/quick-start/): since v2.3.0, `garage server --single-node --default-bucket` with `GARAGE_DEFAULT_ACCESS_KEY` / `_SECRET_KEY` / `_BUCKET` bootstraps without the manual `layout assign`/`key create` steps. It still needs a `garage.toml` (`rpc_secret`, `s3_region`, `replication_factor = 1`), and the S3 port is 3900. ⚠️ The key must be `GK…`-formatted and may need create-bucket permission for our `makeBucket`. The default `s3_region = "garage"` must be set to the region minio-js signs with (`us-east-1`, since we pass none). All of this is untested.

### RustFS

- Apache-2.0. `1.0.0` is its first non-prerelease (2026-09-16, `gh api repos/rustfs/rustfs/releases`). The README marks *"Lifecycle Management (ILM) ✅ Available"* and *"MinIO On-Disk Compatibility 🧪 Preview"*. The image runs as `rustfs` (UID 10001) with credentials in `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY` (`docker-compose-simple.yml`). GA is two weeks old, so it is too new to be the default.

### SeaweedFS

- Apache-2.0, releases about weekly (`4.48` on 2026-09-28). Its wiki lists Put/Get/DeleteBucketLifecycle as supported, *"Transition rules not supported"*, and Range GET (https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API). Credentials come from `s3.json` or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (wiki "S3-Credentials"). ⚠️ How it enforces lifecycle expiry was not verified (the lifecycle wiki page does not exist). It is a multi-component system (master, volume, filer, s3), so it is more than we need.

### versitygw, CloudServer, Ceph RGW

- **versitygw:** Bucket lifecycle is `ErrNotImplemented` (`tests/integration/NotImplemented_actions.go`: `PutBucketLifecycleConfiguration_not_implemented`). `prepareBucket` would throw. **Out.**
- **Zenko CloudServer:** Apache-2.0 and active (`9.3.21` on 2026-09-25). But `ghcr.io/scality/cloudserver:9.3.21` is **amd64 only**, and `zenko/cloudserver` on Hub was last updated 2023. The lifecycle API exists (`lib/api/bucketPutLifecycle.js`), but ⚠️ expiry appears to be run by Zenko's Backbeat (`lib/api/backbeat/listLifecycle*`), not by CloudServer alone. **Out.**
- **Ceph RGW:** full lifecycle support, but `ceph/ceph-container` (home of the single-container `demo` image) is **archived** and *"deprecated and read-only"*. A single-node RGW then means cephadm and a cluster bootstrap, which is out of proportion for one bucket.

## Contradictions with the brief's background

1. **`pgsty/minio` is no longer the live line.** It was renamed to **`pgsty/silo`** on 2026-08-06, and `docker.io/pgsty/minio` stops at `RELEASE.2026-08-04T00-00-00Z`. Newer releases (`2026-09-03`, `2026-09-16`) exist only as `docker.io/pgsty/silo`.
2. **`cgr.dev/chainguard/minio` is not a frozen build of the last community release.** It is built from Chainguard's maintained fork and reports `RELEASE.2026-09-22T19-25-18Z`.
3. **`bitnamilegacy/minio:latest` is `2025.5.24`**, older than its own newest tag `2025.7.23-debian-12-r5`.
4. **`dhi.io/minio` "resolves" on this laptop only because of a stored `dhi.io` credential.** Anonymous access is 401 (as the brief says for the server).
5. **MinIO does point to a free binary, AIStor Free**, and `quay.io/minio/aistor/minio` is pullable anonymously. It is proprietary and needs a license file.

## Sources

| Source | What it gave |
|---|---|
| `apps/api/src/extraction/{archive-store,bucket-lifecycle}.ts`, `delivery/delivery.service.ts`, `config/env.schema.ts`, `docker-compose.yml`, `compose.{dev,pilot}.yml` | The S3 operations used; downloads are proxied; the current images |
| `gh api repos/minio/minio/{readme,releases,commits}`, `gh repo view minio/minio` | Source-only, maintenance mode, the AIStor pointer, archived, last release |
| `gh api repos/pgsty/silo/readme`, Hub tags `pgsty/silo`, `pgsty/minio` | The Silo fork, rename, compatibility claims, tags |
| `GET cgr.dev/v2/chainguard/minio/tags/list`; `minio --version` in the image; `gh api repos/chainguard-forks/minio` | Free-tier tags, fork, version |
| Hub `cleanstart/minio` repo + tags API; https://images.cleanstart.com/images/minio/details; `imagetools inspect`; local run probe | The CleanStart facts above |
| bitnami/containers#83267 | Bitnami legacy freeze |
| `curl -I https://dhi.io/v2/minio/manifests/latest` | 401 when anonymous |
| docs.min.io AIStor container install; min.io blog 2025-12-23; quay.io tag API | AIStor Free terms and tags |
| garagehq.deuxfleurs.fr S3 compatibility + quick start; git.deuxfleurs.fr releases API | Garage |
| `gh api repos/{rustfs/rustfs,seaweedfs/seaweedfs,versity/versitygw,scality/cloudserver,ceph/ceph-container}`; SeaweedFS wiki | The alternatives |
| `docker buildx imagetools inspect <image>` with an empty `DOCKER_CONFIG` (2026-09-29) | Anonymous pullability, platforms, entrypoint and user |
