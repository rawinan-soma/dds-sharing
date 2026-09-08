// The 25 in-scope EnvOcc Report codes — the seed, transcribed verbatim from
// `docs/research/003-disease-group-codes.md`. Read at boot as a plain
// constant, never fetched. Deliberately listed explicitly rather than
// generated from a range: the set is neither contiguous nor 24-valued — 501
// (Heat Stroke) sits far outside the 201-224 block, and code must never
// assume a range or a count (spec §4.9).
export const REPORT_CODES = [
  "201",
  "202",
  "203",
  "204",
  "205",
  "206",
  "207",
  "208",
  "209",
  "210",
  "211",
  "212",
  "213",
  "214",
  "215",
  "216",
  "217",
  "218",
  "219",
  "220",
  "221",
  "222",
  "223",
  "224",
  "501",
] as const;

export type ReportCode = (typeof REPORT_CODES)[number];
