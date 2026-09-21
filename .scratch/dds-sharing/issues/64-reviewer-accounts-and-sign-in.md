# Reviewer accounts and sign-in

Status: ready-for-agent
Source: https://github.com/rawinan-soma/dds-sharing/issues/64 (migrated 2026-09-21)

## What to build

A named Reviewer is seeded from the Docker host, enrols a TOTP authenticator, signs in at `/reviewer`, and holds a session. Nothing is reviewable yet — this slice delivers the identity and the door.

The route is **`/reviewer`, not `/admin`**. That word conflates the person who approves a data release with the person who runs the server, and those carry different risk. Secondary benefit: `/admin` is a constant target of automated scanning, which would otherwise fill the sign-in throttle and the Reviewer event record with noise. The surface is not linked from the public app and is `noindex`. **No security is claimed for the URL** — Reviewers arrive by bookmark, and nobody should later treat the path as a secret worth protecting.

**Accounts**: username, password and TOTP, per-Reviewer and named, minimum two, seeded by a CLI command on the Docker host. Passwords are 12–20 characters with at least one uppercase, one digit and one special character, hashed with argon2id, with no expiry and no rotation. The rules are enforced server-side in one place, hit by both the CLI and the change form.

> The 20-character ceiling is deliberate, not an oversight. It rules out passphrases and truncates what a password manager would generate, which makes the ceiling — not the floor — the binding constraint on password strength. It was chosen knowingly with a TOTP second factor in place. Do not "fix" it without reopening the decision.

**The seeding ceremony**: the CLI generates a random compliant password and prints it once, alongside a terminal QR for the TOTP secret — the Reviewer is present or on a call. It also prints what is recorded about them and that it is permanent: every sign-in and failed sign-in with IP address and user agent, response times against the 24-business-hour promise, every Alert cleared and uncleared, and their display name on every Decision. First login forces a password change and shows that notice once. **A seeded-but-unconfirmed account is inert** — it cannot approve anything until one TOTP code has confirmed enrolment.

> ⚠️ **TOTP parameters are the defaults and only the defaults — SHA-1, 6 digits, 30 seconds.** Google Authenticator **ignores** `algorithm` and `digits` in the `otpauth://` enrolment URI and always computes with those defaults. So a server configured for SHA-256 writes a URI the phone silently disregards: the server verifies against its own answer, the phone shows a different six digits, and the sign-in fails with the same generic message a wrong password gives. **Nothing on either side says why.** Server-side tests pass, because the server agrees with itself — the fault appears only against a real phone. With no email reset and no recovery codes, the only way out is shell access to re-enrol. Use `otpauth` and `qrcode` (zero-dependency, RFC 6238/4226), with `qrcode` rendering the URI as the terminal QR, because enrolment is a CLI ceremony over SSH and the alternative is typing a base32 secret by hand.

**`display_name` must be the person's real name**, and the CLI prompts for it deliberately rather than deriving it from the username, because it is unerasable — it stays on every Decision permanently.

**Password and TOTP are submitted on ONE form and checked together.** A failed sign-in returns one generic message. A two-step form tells an attacker when the password is right, which is the signal that makes attacking the second factor worthwhile. The audit record keeps which factor failed; the screen does not.

> **No lockout at all — throttling only.** Exponential backoff per account **and** per IP, capping around 30 seconds, with state in Postgres so it survives a restart. A lockout an anonymous internet stranger can trigger against a named account *is* the denial of service: with two Reviewers and a business-hours expiry clock, Reviewer unavailability converts directly into expired Requests. At one attempt per 30 seconds an attacker holding the correct password still cannot brute-force six digits.

**No TOTP recovery codes, ever.** They are a written-down second-factor bypass for a data-release surface. The second Reviewer is the recovery mechanism — that is what the two-account minimum was always for, and the minimum is two *reachable people*, not two rows in a table. **The CLI refuses to deactivate below two active Reviewers**, overridable only by an explicit `--force` that prints what it is breaking.

**No self-service email reset, ever** — that would let the Requester's unverified-email world reach the privileged surface. Password reset and TOTP re-enrolment go through the CLI, which requires shell access. `reviewer.email` is for queue notification only. Self-service password change while authenticated is supported, requiring the current password plus a fresh TOTP code.

**Sessions**: a 1-hour sliding idle timeout inside a 6-hour absolute ceiling from login. The ceiling always wins and is never extended — a ceiling with an exception is not a ceiling. Only user-initiated requests extend the session. When the ceiling fires, the Reviewer is cut to sign-in with a return-to address; a warning toast appears at T-5 minutes, bottom-left, not a modal or a banner. Concurrent sessions are allowed, capped at 3 per Reviewer, oldest evicted — a hygiene bound, not a control.

**Sessions and login-throttle state live in Postgres, not Redis.** Deactivation becomes a query rather than a cache-invalidation problem, a Redis flush cannot resurrect state that matters, and a throttle a `docker compose restart` clears is a throttle an attacker can wait out.

**Cookie**: `httpOnly`, `SameSite=Lax`, and `Secure` on by default, disabled only by an explicit development config flag. There is no TLS before production, so the insecure setting must be opted into and must never be reachable by silent degradation. CSRF is a double-submit token on every state-changing `/reviewer` post.

**Deactivation is `deactivated_at`, never a row deletion.** It invalidates live sessions immediately and is itself a recorded event, recording what happened to the Reviewer, never who ran the command (ADR 0020). Shell access to the Docker host is the bar; no host command takes, reads or records an operator name — no argument, environment variable or OS login name. `seeded` has an empty payload and `deactivated` carries only `{ force }`.

Reviewer events land on the `reviewer_event` stream: `login_succeeded`, `login_failed`, `logged_out`, `session_expired`, `password_changed`, `seeded`, `totp_enrolled`, `deactivated`. Failed logins carry IP and user agent and **never the submitted password or TOTP code** — the pattern is the signal, not the credential. A `login_failed` whose code was valid one or two TOTP steps ago is recorded distinctly: that is host clock drift, not an attack, and distinguishing it is what makes an NTP failure diagnosable rather than mysterious.

## Acceptance criteria

- [ ] The Reviewer surface lives at `/reviewer`, is not linked from the public app, and sends `noindex`
- [ ] A CLI command on the host seeds a named Reviewer, printing a random compliant password once and a terminal TOTP QR, plus the retention notice
- [ ] The CLI prompts for `display_name` as the person's real name rather than deriving it
- [ ] A seeded account cannot approve anything until one TOTP code confirms enrolment, and first login forces a password change
- [ ] The enrolment URI and the server's verification both use the defaults — SHA-1, 6 digits, 30 seconds — and a test asserts a code generated with those defaults verifies, so a non-default algorithm cannot ship
- [ ] Password rules (12–20 chars, one uppercase, one digit, one special, argon2id) live in one server-side place used by both the CLI and the change form
- [ ] Sign-in takes password and TOTP on one form, checked together, returning one generic failure message
- [ ] The audit record distinguishes which factor failed; the screen does not
- [ ] Failed sign-ins are throttled with exponential backoff per account and per IP capping near 30 seconds, with state in Postgres surviving a restart — and no account is ever locked out
- [ ] A TOTP code valid one or two steps ago is recorded as a distinct kind of `login_failed`
- [ ] No recovery codes exist, and no self-service email reset path exists
- [ ] Self-service password change requires a live session, the current password and a fresh TOTP code
- [ ] Sessions slide at 1 hour inside a 6-hour ceiling that is never extended; the ceiling redirects to sign-in with a return-to address; a T-5 toast appears bottom-left
- [ ] Sessions and throttle state are in Postgres, not Redis
- [ ] The session cookie is `httpOnly`, `SameSite=Lax` and `Secure` unless an explicit development flag is set
- [ ] The deactivation CLI refuses to go below two active Reviewers without an explicit `--force` that prints what it is breaking
- [ ] Deactivation sets `deactivated_at`, deletes no row, invalidates live sessions immediately, and writes a `deactivated` event carrying only `{ force }`
- [ ] `seeded` has an empty payload, and neither the seed nor the deactivate command takes, reads or records an operator name (no argument, environment variable or OS login name)
- [ ] All eight `reviewer_event` types are written where they occur, and none carries a password or TOTP code

## Blocked by

- #61 — Audit spine: append-only events the application cannot rewrite




## Comments

**rawinan-soma** — 2026-09-12

**Design reference:** `docs/design_handoff_dds_sharing/`, landed in fd98274. Read its `README.md` first; the prototype runs.

**Your screen: 7a (Sign in).** A centred blueprint card, 420px.

It already matches §17.4 and needs no reconciliation: **username, password and the authenticator code on one form, submitted and checked together**, never two steps, with one generic failure for all three causes — *"Username, password or code is wrong."* The notes around it carry the rest: failed attempts recorded with IP and user agent and never with what was typed; accounts seeded on the host; no self-service reset; the other Reviewer is the recovery path; two named Reviewers reachable at all times. The closing note says the route is unlinked and kept out of search results, and calls that tidiness rather than security.

Treat it as the source of **visual layout only** — this ticket and §17.4 own the behaviour.

⚠️ **The prototype's sign-in accepts any six-digit code.** That is fixture behaviour, not a specification. Do not port `support.js`; the dark `SIMULATE · SCAFFOLDING` dock is not part of the product.

**rawinan-soma** — 2026-09-14

> *This was generated by AI during triage.*

## Agent Brief

**Category:** bug
**Summary:** PR #84 implements most of §17.5 correctly (verified live: CLI seeding, TOTP confirmation, throttling, deactivation floor, session cookie flags all work end to end), but three things are wrong or missing before this ticket is done.

---

### 1. Regression: unmatched non-API routes no longer fall back to the SPA shell

**Current behavior:** A request to an unknown client-side route (anything not under `/api` or a health path) now returns a JSON 404 instead of the Angular SPA shell. Confirmed by running the app's existing SPA-fallback test against both the pre-PR code and the PR's code: it passes before, fails after.

**Desired behavior:** Any unmatched non-API, non-health path continues to serve the SPA shell (as it did before this PR), while unmatched `/api/*` paths still return a JSON 404 — including `/api/reviewer/*` paths, which is the thing this PR was also trying to fix.

**Key interfaces:**
- Whatever now provides the catch-all "unmatched API route" behavior must not shadow the static/SPA-fallback handling for non-API paths.
- The ordering/registration of the reviewer routes, the catch-all, and the static file server all need to coexist: reviewer routes must not 404 under the catch-all, the catch-all must not swallow non-API paths, and `/` and unknown SPA routes must both still return the HTML shell.

**Acceptance criteria:**
- [ ] An unmatched non-API route (e.g. `/some/spa/route`) returns the SPA shell (200, `text/html`)
- [ ] `/` still returns the SPA shell
- [ ] An unmatched `/api/*` route still returns a JSON 404
- [ ] `/api/reviewer/*` endpoints are still reachable and not swallowed by the catch-all
- [ ] `/api/health` still correctly 404s (not swallowed by the static handler)

---

### 2. No enforcement or notice for the forced first-login password change

**Current behavior:** The server correctly flags a first-time sign-in as requiring a password change (the flag reaches the client in the sign-in response), but the web client does nothing with it — a Reviewer signs in and lands straight on the signed-in view with no notice and no way to change their password from the UI.

**Desired behavior:** When a sign-in response indicates the password must be changed, the Reviewer is shown the one-time retention/first-login notice and a form to set a new password (current password + new password + a fresh TOTP code), per §17.5's rules: current password required, new password checked against the shared password policy, and a fresh TOTP code required. Until the change succeeds, the Reviewer should not be able to proceed to whatever the "signed in" surface is meant to lead to next (there's nothing built past sign-in yet, so "block" here means: show the change-password gate instead of the plain signed-in view).

**Key interfaces:**
- The sign-in outcome already includes a signal for "must change password" — the client needs to branch on it.
- A password-change submission needs to reuse the same client-side call the API already exposes for changing a password (current password + new password + TOTP code), and needs to surface the same policy violations the server can return.

**Acceptance criteria:**
- [ ] On a sign-in response indicating a forced password change, the Reviewer sees the retention/first-login notice and a password-change form instead of the plain signed-in view
- [ ] Submitting current password + a compliant new password + a fresh TOTP code succeeds and moves the Reviewer past the gate
- [ ] A non-compliant new password shows the specific policy violation(s), not a generic error
- [ ] A wrong current password or stale TOTP code on this form fails the same way sign-in does (generic message, throttled the same way)
- [ ] The notice is shown once — it does not reappear on a later sign-in for the same Reviewer once the password has been changed

---

### 3. No session-ceiling warning or expiry redirect

**Current behavior:** The client receives the session's absolute expiry time on sign-in but does nothing with it — no warning is shown as the session approaches its ceiling, and nothing happens client-side when it's reached.

**Desired behavior:** Five minutes before the session's absolute ceiling, a non-blocking warning toast appears at the bottom-left of the page (not a modal, not a banner). When the ceiling is actually reached, the Reviewer is returned to the sign-in form with a return-to address so they land back where they were after signing in again.

**Key interfaces:**
- The absolute expiry timestamp the sign-in response already returns is the basis for timing the warning and the eventual redirect.
- This is time-since-login, not idle-based — the 1-hour idle/sliding window is a separate, already-implemented server-side concern and is out of scope here.

**Acceptance criteria:**
- [ ] A toast appears at T-minus-5-minutes before the session's absolute ceiling, positioned bottom-left
- [ ] The toast does not block interaction with the rest of the page
- [ ] When the ceiling is reached, the Reviewer is taken to the sign-in form
- [ ] The redirect carries a return-to address so a subsequent sign-in returns the Reviewer to where they were
- [ ] No warning or redirect fires based on idle time alone — only the absolute ceiling drives this behavior

---

**Out of scope:**
- Changing the 1-hour idle / 6-hour ceiling values themselves, or any other session/throttle/TOTP parameter — those are already correct and tested
- Building whatever screen a signed-in Reviewer is meant to see after these gates (no such screen exists yet; only the gates themselves are in scope)
- Any change to the CLI tools, database schema, or reviewer_event catalogue — all of that is already correct

**rawinan-soma** — 2026-09-17

Reopening: the implementation was discarded. The branch carrying this work (ticket#70) and its PR were deleted, so nothing on any branch satisfies this ticket. Back to ready-for-agent.

**rawinan-soma** — 2026-09-18

**The design reference has moved.** `docs/design_handoff_dds_sharing/` was never restored to `main` and does not exist; an earlier comment on this issue points at it. Ignore that path.

The design is now `docs/design/` — read [`README.md`](../blob/main/docs/design/README.md) first, then [`handoff.md`](../blob/main/docs/design/handoff.md) for this screen's layout, states, edge cases and accessibility. Tokens and the two components are in [`system.md`](../blob/main/docs/design/system.md) and `docs/design/source/`. The screens themselves are in the Lunagraph project `dds-sharing`.

Your screens: **4** เข้าสู่ระบบ (sign in), and the session warning on **12** คิวว่างและเซสชัน.

**Copy comes from the catalogue, not from templates.** Every string is keyed in `messages/en.json` and `messages/th.json`. The English is authored and is the source (ADR 0010); the Thai in the catalogue and on the design canvas is an agent-written layout proxy, replaced by #96. Build against the keys, and do not hand-write a sentence into a template.

Treat the design as the source of **visual layout only**. Structure, ordering and copy are settled by this ticket and the spec, and they outrank the design wherever they disagree.
