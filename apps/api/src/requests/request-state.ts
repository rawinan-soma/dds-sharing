// The states a Request row can be in (spec §2). The row is a cache of the event
// stream; extraction's own sub-states (queued, running, ready, failed) are the
// job's, read by `in-flight.ts`, and are not Request states.
export const REQUEST_STATES = [
  'pending',
  'rejected',
  'expired',
  'approved',
  'collected',
  'expired_uncollected',
  'abandoned',
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

// The one place *terminal* is defined (spec §10.9): a Request that is terminal
// has nothing left to be done to it. `settledState` in `in-flight.ts` only
// reads a lapsed link as the `expired_uncollected` the tick is about to write. Duplicate suppression asks the opposite
// question — is there an unfinished Request? — and answers it from this list.
export const TERMINAL_REQUEST_STATES = [
  'rejected',
  'expired',
  'collected',
  'expired_uncollected',
  'abandoned',
] as const satisfies readonly RequestState[];
