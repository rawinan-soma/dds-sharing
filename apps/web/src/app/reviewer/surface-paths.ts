import { type SurfaceZone } from './queue-api';

// Where a Request opens on the Reviewer surface. One place, so the search and
// the record page cannot send the same Request to two different routes.

/** A Request still on the surface opens in its own zone, as usual. */
export function zonePath(zone: SurfaceZone, requestId: string): string[] {
  switch (zone) {
    case 'queue':
      return ['/reviewer', requestId];
    case 'alerts':
      return ['/reviewer', 'alerts', requestId];
    case 'in_flight':
      return ['/reviewer', 'in-flight', requestId];
  }
}

/** A terminal Request opens as a record, by its reference (spec §10.10). */
export const recordPath = (reference: string) => [
  '/reviewer',
  'lookup',
  reference,
];
