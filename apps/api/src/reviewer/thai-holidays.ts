// Thai public holidays, as ICT calendar days (`YYYY-MM-DD`): the checked-in
// config the business-hours clock reads (spec §15.2). Reviewed annually.
//
// A day listed here does not advance the clock, which delays expiry. Read the
// direction before "correcting" an entry: a day added here can only give a
// Request more time, and the safe way to be wrong is to list a day that was not
// a holiday, never to omit one that was.
//
// DRAFT ENTRIES: fixed-date holidays only, drafted by an agent and NOT yet
// checked against the Cabinet's announced list. Still to add at the annual
// review, because they move: the lunar holidays (Makha, Visakha, Asalha and
// Khao Phansa Bucha), the substitute weekdays for holidays that fall on a
// weekend, and any one-off days the Cabinet announces.
export const THAI_HOLIDAYS: readonly string[] = [
  // 2026 (B.E. 2569)
  '2026-01-01', // New Year's Day
  '2026-04-06', // Chakri Memorial Day
  '2026-04-13', // Songkran
  '2026-04-14',
  '2026-04-15',
  '2026-05-01', // National Labour Day
  '2026-05-04', // Coronation Day
  '2026-06-03', // H.M. Queen Suthida's birthday
  '2026-07-28', // H.M. the King's birthday
  '2026-08-12', // H.M. Queen Sirikit the Queen Mother's birthday
  '2026-10-13', // H.M. King Bhumibol Adulyadej the Great Memorial Day
  '2026-10-23', // Chulalongkorn Day
  '2026-12-05', // H.M. King Bhumibol's birthday, National Day
  '2026-12-10', // Constitution Day
  '2026-12-31', // New Year's Eve
  // 2027 (B.E. 2570)
  '2027-01-01',
  '2027-04-06',
  '2027-04-13',
  '2027-04-14',
  '2027-04-15',
  '2027-05-01',
  '2027-05-04',
  '2027-06-03',
  '2027-07-28',
  '2027-08-12',
  '2027-10-13',
  '2027-10-23',
  '2027-12-05',
  '2027-12-10',
  '2027-12-31',
];

export const HOLIDAYS: ReadonlySet<string> = new Set(THAI_HOLIDAYS);
