/**
 * Every fixed Postgres advisory-lock key the application takes, in one list,
 * so a new one is chosen against the others rather than guessed. They share one
 * bigint keyspace with the per-IP submit lock (`requests.service.ts`, keyed by
 * `hashtextextended` of the address) and with the test suite's migration lock
 * (`test/support/scratch-database.ts`, 6_425_001).
 */
export const ADVISORY_LOCK = {
  /** Serialises the two-reachable-Reviewers check (reviewer-accounts.ts). */
  reviewerAccounts: 64,
  /** One tick pass at a time, across every process (spec §15.3). */
  tick: 7_215_003,
} as const;
