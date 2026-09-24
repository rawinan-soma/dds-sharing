import { type RequestState, TERMINAL_REQUEST_STATES } from './request-state';

/**
 * The Reviewer surface's three zones (§10.1, §10.6, §10.9). A Request appears
 * in exactly one of them, in whichever carries the action it needs — or in
 * none, once nothing remains to be done to it.
 */
export type SurfaceZone = 'queue' | 'alerts' | 'in_flight';

/**
 * Derived at read time, never stored. An open Alert wins over the in-flight
 * list: a badge on a list that does not auto-refresh is the passive list §10.6
 * forbids, so the Request moves rather than being marked. Clearing the Alert
 * returns it to the in-flight list if it is still in flight, and drops it from
 * the surface if the clearing was the last thing to do.
 */
export function surfaceZone(
  state: RequestState,
  hasOpenAlert: boolean,
): SurfaceZone | null {
  if (state === 'pending') return 'queue';
  if (hasOpenAlert) return 'alerts';
  if ((TERMINAL_REQUEST_STATES as readonly RequestState[]).includes(state)) {
    return null;
  }
  return 'in_flight';
}
