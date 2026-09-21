# The Thai copy, and the flip to Thai-only

Status: ready-for-human
Blocked by: 74, 73, 71, 66, 65, 64, 63
Source: https://github.com/rawinan-soma/dds-sharing/issues/96 (migrated 2026-09-21)

## What to do

Every sentence this service says exists in `messages/en.json` and `messages/th.json`, keyed. The English is authored and is the source (ADR 0010). **The Thai currently in `th.json` is a layout proxy written by an agent, not translation** — it was written first so the design could be tested against real Thai line lengths, which is the failure mode that sank the previous design. It reads as agent Thai and is not fit to ship.

This ticket replaces it, then flips the service to Thai-only.

Two halves, in order:

### 1. The copy pass

Go through `messages/th.json` against `messages/en.json` and rewrite the Thai. Review it **on the running UI, not in JSON** — the accepted cost in ADR 0010 is that Thai is unreviewable by a domain reader until the screens exist, and the mitigation is reviewing on screen. The twelve screens are in the Lunagraph project `dds-sharing`; `docs/design/handoff.md` says which strings land where.

**Six keys carry a decision that exists nowhere else** (spec §16.3). Reword them freely for tone. If one changes what it *says*, the spec changes with it and this ticket is no longer only a copy ticket:

- `requester_gate_notice` — a named human approves before any data is fetched
- `requester_no_reason_notice` — a rejection gives no reason, said up front rather than sprung at rejection time
- `requester_span_cap_notice` — the 365-day cap, attributed to upstream
- `requester_epidem_area_label` — the filter is on the province that **investigated** the case (`epidem_chw_code`), not residence and not the treating unit, said where the choice is made
- `requester_email_warning` — the only place a Requester is told a typo will not be caught
- `requester_retention_notice` — kept, indefinitely, why, and removable by telephone

Two more sentences are load-bearing without being on that list, and must not be softened:

- `requester_deid_lead` — *a file with no names in it is the correct result, not a broken one*
- `reviewer_no_email_edit_heading` / `_detail` — a Reviewer decides who receives data, never where it is sent (ADR 0017)

**Decisions to settle while doing this:**

- **`ท่าน` or `คุณ`.** The proxy uses `ท่าน` throughout. One decision, 230 keys.
- **`API` on a Requester-facing page**, or `ระบบต้นทาง`, in `requester_span_cap_notice` and `error_span_too_long_detail`.
- **`app_telephone` is invented.** `0 2590 4393` is a placeholder and appears on six screens and in three emails. It needs the real number, and the four emails need a real sender address.
- Phrases the agent flagged as probably wrong: `เจ้าหน้าที่ที่ระบุชื่อ` (for *a named officer*), `ที่ท่านรับสาย`, `ไฟล์ที่เสีย`, `พิมพ์ได้อิสระ`.

**The alert outcome words are a measurement instrument**, not labels: `reviewer_alert_outcome_reached` / `_unreachable` / `_no_action` / `_contacted` / `_abandoned`. Their counts are the only evidence the service will ever have about how often its silent failures happen, so changing them after go-live breaks comparability. They should be words a Reviewer would use on the telephone.

Named reviewers for the Thai: the repo owner and colleagues (ADR 0010 names them rather than hoping for them).

### 2. The flip

Only after every UI and email ticket has landed and the copy is reviewed on a staging deploy.

- `project.inlang/settings.json` → `baseLocale: "th"`, `locales: ["th"]`, strategy unchanged.
- **Delete `src/paraglide`.** `cleanOutdir` is accepted-but-ignored in `paraglide.config.*`, so a stale outdir survives a `baseLocale` change and renders Thai screens in English — which reads as an incomplete translation rather than a build fault, at exactly the moment the flip is being reviewed.
- **Never add the `url` strategy.** Its default patterns leave the base locale unprefixed and prefix every other one, so `baseLocale` would decide which language owns `/`.
- `messages/en.json` stays checked in and maintained. After the flip the compiler never reads it again, so the §17.1 parity check is the only thing binding the two files together.

> ⚠️ **The failure mode inverts at the flip and gets worse.** Before it, a missing key renders English. After it, `fallbackMap["th"]` is `undefined` and a missing key renders **the raw message key** on a Requester's screen, silently, with no compiler warning. Nothing in the toolchain catches this. §17.1 carries the gate because no dependency will.

## Acceptance criteria

- [ ] Every value in `messages/th.json` is human-written Thai, reviewed on the running UI rather than in JSON
- [ ] `ท่าน` or `คุณ` is settled and applied consistently across all keys
- [ ] `app_telephone` holds the real number, and the email sender identity is confirmed
- [ ] The six load-bearing keys still say what the table above says they must; any that changed meaning are reflected in `docs/spec.md` §16.3 in the same commit
- [ ] `messages/en.json` and `messages/th.json` have identical key sets, enforced by the §17.1 parity check
- [ ] A staging deploy has been read by the repo owner and at least one named colleague
- [ ] After the flip: `baseLocale: "th"`, `locales: ["th"]`, `src/paraglide` deleted and rebuilt, and no raw message key appears on any screen
- [ ] The `url` strategy is absent

## Blocked by

Every UI and email ticket, because the copy is reviewed on screens that must exist first: #63, #64, #65, #66, #71, #73, #74.


