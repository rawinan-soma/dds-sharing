# 21. The business-hours clock has no holiday list

Date: 2026-09-23

## Status

Accepted. Decided by the repo owner during ticket #72, after its clearance.
Amends `docs/spec.md` §11.4 (the lapse edge's example), §15.2, §17.3 and the
accepted-risks list in §18.14; amends the derived SRS (S12, §2.6, the submitted
page's promise, the reference-data interface, the §4.24 exception, NFR on
business hours, the clock requirement and the known limitations) and item 13
of the project charter; and removes the holiday config that ticket #65 added.

## Context

§15.2 defined the business-hours clock as Mon–Fri 08:30–16:30 ICT **minus Thai
public holidays from a checked-in config file reviewed annually**, and claimed
one load-bearing property for it: *a stale holiday list can only make expiry
more generous, never less*.

The #72 clearance showed that property is false. A list nobody updated does not
add days; it **omits** them, and an omitted holiday is counted as a working day.
That takes attention time away from a Request instead of adding it. The
checked-in list was already stale as written: fixed-date holidays only, drafted
by an agent, not checked against the Cabinet's announcement, with the lunar
holidays and the substitute weekdays missing, and nothing at all after 2027.
Nothing guarded the clock against reading past the list's last year.

The remedies were a coverage guard that refuses to run past the list, or an
annual list maintained by hand against a Cabinet announcement. Both keep a
recurring, easily forgotten task alive for a property the list could not
actually deliver.

## Decision

**The clock counts Mon–Fri 08:30–16:30 ICT and nothing else stops it.**
Weekends are the only closed days. There is no holiday list, no config file and
no annual review.

The clock's two uses are unchanged: Request expiry measures 24 business hours
on it (§10.4), and the collection lapse asks it only when the queue next opens
(§11.4).

## Consequences

**A public holiday counts as a working day, and this is the one way the clock
can be wrong.** A Request that arrives before a holiday has less real Reviewer
attention inside its 24 business hours than its window says. Over a long
holiday, such as Songkran, it can expire with nobody at their desk. The cost
falls on the Requester, who resubmits, and it shows up in the record: `expired`
carries `reviewer_accounts_active` and `notified_at`, so an expiry over a
holiday can be recognised.

A collection-lapse Alert can also be raised on a holiday, to a queue nobody is
reading that day, and wait for the next working morning. After a holiday
Friday that morning is Monday, which can be after the token has died: a
Thursday 10:00 Delivery raises its Alert on the Friday and is first read on
the Monday, a day after its token expired. The Reviewer then has nothing to
telephone about, and `expired_uncollected` records the Request.

**The clock is fully deterministic from the instant alone.** No file can drift,
go stale or be edited mid-flight, so there is nothing for an operator to
maintain and nothing to guard.

## Alternatives rejected

**Keep the list, and guard its coverage.** Refuse to boot, or raise the banner,
once the clock reads past the last listed year. This makes staleness loud, but
it keeps a hand-maintained yearly task alive, and it still cannot catch a list
that covers the year but is missing a lunar holiday.

**Keep the list, and complete it now.** This only moves the staleness forward by
a year, and it depends on the Cabinet's announcement, which lands after the
list would need to be updated.
