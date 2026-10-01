# Duplicate suppression matches email and ask, not IP

Status: closed
Labels: enhancement

## What to build

Duplicate suppression (spec §4.8, SRS FR-06) refuses a submit from an IP that already has an unfinished Request. A สคร. office is one IP, so one officer's pending Request holds the whole office for up to 24 business hours, and a Requester who mistyped their email cannot send a corrected Request. The repo owner narrowed the rule on 2026-09-30: **refuse only when an unfinished Request has the same email and the same ask.** A refresh or a double-posted form re-sends exactly the same form, so the narrower key still catches what the rule exists for.

**The match.** An unfinished Request (not in a terminal state) whose:

- email (from `request_contact`) equals the submitted email, compared trimmed and case-insensitive;
- Disease group id is the same;
- `from` and `to` are the same;
- area is the same **as stored**: both national, or the same province list after any region is expanded. Region 13 and the province กรุงเทพมหานคร are therefore the same ask.

**The email is a match key, never a control key.** It is still unverified free text. Say so in the code comment where the query is, in the words of spec §4.8, so nobody later reads it as verification.

**Keep it atomic.** The current advisory lock serialises per IP so a double-post cannot race past its own check (`apps/api/src/requests/requests.service.ts`). Serialise on the new key instead (for example a hash of the normalised email), so two identical posts still cannot both insert, and different emails never wait on each other.

**The refusal page (screen 3) has one case, not two.** The *probably a colleague's* case is gone, because a colleague's form carries a different email. The page:

- title *you already sent this request*; the Request was saved, there is no need to send again, and the reference number is on the confirmation page and in the decision email;
- **still no reference number, submit time or status**: the email is unverified, so anyone typing another person's address and ask would otherwise see that person's reference;
- a panel saying a different ask or a corrected email goes through, with a secondary button back to the form that keeps every field.

Design: frame `3 · ส่งคำขอซ้ำ` on the Lunagraph page "Requester form: prototypes" (project `dds-prototype`) and `docs/design/handoff.md` §3. Copy is authored in English in the catalogue (ADR 0010); replace the four `requester_duplicate_*` keys to match and drop the colleague keys.

**What stops depending on the IP.** Suppression no longer reads the client IP. `TRUST_PROXY` is still needed so the `submitted` event records the real client address, but the rationale in `apps/api/src/config/namespaces.ts` and in the `TRUST_PROXY` criteria of #77 and #101 ("duplicate suppression is keyed on the client IP") becomes stale; reword those to the audit reason. The partial index `request_event_submitted_ip` exists only for the old query; drop it in a migration unless something else reads it.

Spec §4.8, §16.4's typo note, SRS FR-06 and the glossary entry in `CONTEXT.md` already describe the new rule.

## Acceptance criteria

- [ ] A second submit with the same email and ask as an unfinished Request is refused (409, `request_in_progress`) and nothing is stored
- [ ] The same email with a different Disease group, different dates or a different area is accepted
- [ ] A different email with the same ask is accepted, including from the same IP
- [ ] Emails differing only in case or surrounding whitespace count as the same
- [ ] Region 13 and the province กรุงเทพมหานคร count as the same area; national matches only national
- [ ] Once the first Request reaches a terminal state, the same email and ask is accepted again
- [ ] Two identical submits sent concurrently produce exactly one Request (the lock is on the new key)
- [ ] The query no longer reads the client IP; the code comment says the email is a match key and is never verified
- [ ] Screen 3 shows one case with no reference number, submit time or status, and its back button returns to the form with every field kept
- [ ] The catalogue's `requester_duplicate_*` keys match the new screen in English and Thai, and the colleague keys are gone
- [ ] `request_event_submitted_ip` is dropped in a migration, or kept with a comment naming what still reads it
- [ ] The `TRUST_PROXY` rationale in `namespaces.ts`, #77 and #101 names the audit record, not duplicate suppression
- [ ] Existing request-submission tests are updated, and none still asserts that a second IP-matched submit is refused

## Comments

Merged in #120 (cc6cf9af61de6da0ff72e9adfa52559d488c59d0).
