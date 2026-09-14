// Thai public holidays observed by the civil service, ICT dates
// (spec §10, docs/design_handoff_dds_sharing/README.md's business-hours
// arithmetic). Checked in and reviewed annually — cabinet resolutions add
// ad-hoc "special holidays" (and shift a holiday that falls on a weekend to
// the following Monday) well after this list is last reviewed, so a missing
// individual date is an accepted residual risk of review lag: nothing can
// tell it apart from an ordinary weekday until the list is updated.
//
// Running past the list's latest year entirely is different, and is guarded
// in business-hours.ts's isBusinessDay — a year beyond the last one entered
// here is treated as not yet reviewed, not as "no holidays that year", so it
// cannot silently start expiring Requests sooner the moment the list runs
// out (spec §10: "a stale holiday list can only make expiry more generous,
// never less"). This file must still never be "fixed" by inferring extra
// dates algorithmically — only a real annual review adds them.
export const THAI_PUBLIC_HOLIDAYS: readonly string[] = [
  // 2026
  "2026-01-01", // New Year's Day
  "2026-03-03", // Makha Bucha Day
  "2026-04-06", // Chakri Memorial Day
  "2026-04-13", // Songkran
  "2026-04-14", // Songkran
  "2026-04-15", // Songkran
  "2026-05-01", // National Labour Day
  "2026-05-04", // Coronation Day
  "2026-06-03", // HM Queen Suthida's Birthday
  "2026-07-28", // HM King's Birthday
  "2026-07-29", // Asalha Bucha Day
  "2026-08-12", // HM Queen Mother's Birthday
  "2026-10-13", // Anniversary of the Death of King Bhumibol
  "2026-10-23", // Chulalongkorn Day
  "2026-12-05", // HM King Bhumibol's Birthday / National Day
  "2026-12-10", // Constitution Day
  "2026-12-31", // New Year's Eve
];
