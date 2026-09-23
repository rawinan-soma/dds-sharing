/**
 * The BullMQ states in which a job will still run without anyone's help. A
 * Postgres row whose job is in none of them has lost its job: the tick
 * re-enqueues it (extraction) or abandons it (mail).
 */
export const LIVE_JOB_STATES: ReadonlySet<string> = new Set([
  'waiting',
  'active',
  'delayed',
  'waiting-children',
  'prioritized',
]);
