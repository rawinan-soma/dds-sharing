# 20. A host command does not record who ran it

Date: 2026-09-14

## Status

Accepted. Removes the **Operator** from `CONTEXT.md` and the required
`--operator` argument that the #85 triage added to §17.5 and to #85's brief.
Amends the `seeded` and `deactivated` Reviewer event payloads that #64 (PR #84)
introduced. Decided while triaging #87, which asked whether the Operator should
be a fifth Actor kind.

## Context

#84 recorded an operator name on `seeded` and `deactivated` Reviewer events,
taken from an environment variable or the host's login name. The #85 triage
replaced that with a required `--operator <name>` argument and added the
Operator to the glossary. #87 then asked how an Operator's action is recorded
among the Actor kinds. Meanwhile password reset and TOTP re-enrolment, run on
the same host by the same person, recorded no name at all.

## Decision

**Host commands name no one.** The Reviewer events they write record what
happened to the Reviewer, not who typed the command. The person who runs the
host is outside the domain: no glossary term, no Actor kind, no argument. The
four Actor kinds stand.

The commands themselves stay — seeding, password reset, TOTP re-enrolment and
deactivation — because they carry the checks: the Reviewer event, the
two-Reviewer floor, ending live sessions, and password hashing.

## Considered options

- **A fifth Actor kind, or a required `--operator` on every command.** Rejected:
  the name is typed by the person themselves and checked against nothing, so
  anyone with shell access can type any name. It would be a field that looks
  like accountability without being it, and on a one-operator service (R13) it
  would mostly repeat one name.
- **A password reset by email, so fewer jobs need the host.** Rejected: §17.5
  and X10 stand, and it would not recover a lost TOTP device anyway, so the host
  path would still be needed.
- **Editing the database by hand instead of commands.** Rejected: same access,
  none of the checks above.

## Consequences

**"Who seeded or deactivated this Reviewer?" has no answer in the record.**
Accepted — the typed name never really answered it. A forced deactivation below
two Reviewers is still recorded as forced.

**Watch for.** An audit-minded reader will ask for the name back. The answer is
that shell access is the bar (§17.5), and a name nobody verifies adds nothing to
it.
