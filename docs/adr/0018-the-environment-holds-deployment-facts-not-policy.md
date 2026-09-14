# 18. The environment holds deployment facts, not policy

Date: 2026-09-14

## Status

Accepted. Amends §10.5, whose "explicit development config flag" this names,
§11.2 and §13.2 (NFR-09, NFR-31 and CI1 in the derived SRS). Decided while
triaging #85 (configuration validation at boot).

## Context

The spec calls several things "configurable" or "a single configuration point":
extraction concurrency `N` (§13.2), the 72-hour Download token expiry and its
72-hour bucket lifecycle backstop (#72), the session limits (§10.5), the
collection-lapse trip-wire, and the 23-column de-identification allowlist
(§6). Separately, §11.2 lists SMTP settings and `FRONTEND_URL` as configuration,
and the upstream bearer token is configuration too. Both readings of *configuration* were
live, and the difference matters once config is validated and typed: whatever is
in the environment can be changed on the VM by editing `.env`, with no commit, no
review and no record.

Separately, three settings have an insecure value that development needs,
because no TLS exists before production: the session cookie's `Secure`
flag, `https` on the base URL that builds Download links, and `https` on the
upstream base URL that carries the bearer token. Development mail through
Mailpit also needs plaintext SMTP. §10.5 requires that no insecure setting
is reachable by silent degradation.

## Decision

**The environment holds deployment facts only**: hosts, ports, URLs,
credentials, the sender address, and the two flags below. **Policy stays a
reviewed constant in code**, with the comment the spec requires next to the
number ("why `N` is 1", "why 72 and 72 is safe"). "Configurable" in the spec
means *one named, commented place in the code*, not a variable on the VM.

**An insecure setting is reachable only through a named opt-in flag that
defaults to secure**, and a flag that is on is announced — a `WARN` line at boot
and a field in `/health`:

- `ALLOW_INSECURE_TRANSPORT` — one flag for one fact, *this deployment has no
  TLS*: it permits a non-`Secure` session cookie and `http` for `FRONTEND_URL`
  and `UPSTREAM_BASE_URL` together, so the cookie can never be secure while the
  link it protects is not.
- `SMTP_ALLOW_PLAINTEXT` — separate, because the relay's TLS is not ours.

Every other variable is required, with no default, except `PORT`.

## Consequences

**A policy change is a commit.** Raising `N`, changing an expiry or widening the
allowlist is a reviewed diff with its reasoning beside it — which is what §6
means by "widening it is a decision, reviewed as one", and what §13.6 needs, since
an unreviewed concurrency bump is how the upstream token gets revoked.

**Coupled numbers stay coupled.** The token expiry cannot be moved in `.env`
while the bucket lifecycle, which lives in MinIO, stays behind — the failure
where objects are deleted under a still-valid token and no deletion record is
written.

**The test suite proves production's numbers**, because production cannot run
different ones.

**Accepted, and it is the real cost: tuning needs a redeploy.** On one VM with
one operator that is a `docker compose up`, not a release train.

**Watch for.** *"Make it an env var with the current value as the default"* is
the natural next suggestion, usually for `N` or a timeout, and usually during an
incident. It moves a decision out of review and splits the value from the reason
it has. This ADR is the answer; change the constant instead.
