// Thai public holidays observed by the civil service, ICT dates
// (spec §10, docs/design_handoff_dds_sharing/README.md's business-hours
// arithmetic). Checked in and reviewed annually — cabinet resolutions add
// ad-hoc "special holidays" (and shift a holiday that falls on a weekend to
// the following Monday) well after this list is last reviewed, so treat a
// missing year as a signal to update it, not as "no holidays that year".
//
// A stale list only ever *understates* holidays, never invents one — the
// safe direction (spec §10): understating a holiday makes the 24-business-
// hour clock advance on a day that should not count, so review adds dates,
// and this file must never be "fixed" by inferring extra ones algorithmically.
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
