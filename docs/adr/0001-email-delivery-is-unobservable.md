# Email delivery is unobservable, and the design assumes it

The only channel that reaches a Requester is email, and the mail environment
([#17](https://github.com/rawinan-soma/dds-sharing/issues/17)) makes its arrival
unknowable: the relay sends from `ddc.mail.go.th` to `moph.go.th` recipients, it
sits on a non-government domain, and bounces return to `envocc@ddc.mail.go.th` —
a mailbox this application does not own. We considered asking for an
application-readable bounce mailbox and **declined it**: it adds a moving part and
a deployment dependency while still missing the likelier failure, a message filed
silently as junk. So the system treats *"we cannot know whether the email
arrived"* as a premise and infers failure from behaviour instead
([#19](https://github.com/rawinan-soma/dds-sharing/issues/19)).

## Consequences

**"Failed delivery" is two unrelated things, and the code must keep them apart.**
A **send failure** is the relay refusing the message — observable within seconds,
caused by our configuration or the relay's health, never by the recipient. A
**collection lapse** is the relay accepting a Delivery and the Requester making no
Attempt on the Download token for 24 business hours — never observed, only
inferred from silence, and ambiguous even then (junk folder, or annual leave).
They get different clocks, different handling, and different audiences.

**Silence is the primary signal, so it must be measured.** `expired_uncollected`
exists as a distinct terminal state for exactly this reason: without it, a Request
whose Extract was collected and one whose email vanished end identically in the
record, and the failure this whole design accommodates becomes invisible. It is
the only number that tells anyone whether email is working.

**There is deliberately no bounce handling, and no `mail_bounced` event.**
A future reader will find mail code with no bounce path and assume it is an
oversight. It is not. Do not add one without also acquiring a mailbox the
application actually reads — and note that even then it would catch only hard
bounces, not the dominant failure.

**A false-positive rate is accepted on purpose.** The 24-business-hour lapse
alert will sometimes fire at a Requester who was merely slow, and a Reviewer will
telephone them for nothing. That is the cheaper error: the alternative is a
completed extraction, an upstream slot, and a Request all wasted in silence.

**Clock correctness becomes load-bearing.** The lapse threshold is measured in
business hours in ICT over UTC-stored timestamps, so NTP on the host
([#18](https://github.com/rawinan-soma/dds-sharing/issues/18)) is a correctness
requirement for this inference, not only for Reviewer TOTP.
