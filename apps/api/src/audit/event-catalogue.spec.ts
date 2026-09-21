import { describe, expect, it } from 'vitest';
import { RequestEvent } from './event-catalogue';

// The pairing of actor and outcome is a compile-time guarantee, so this spec is
// checked by `tsc`: each @ts-expect-error fails the build if it stops erroring.
describe('event catalogue types', () => {
  const at = new Date();
  const requestId = 'r';

  it('accepts the pairings the spec allows', () => {
    const events: RequestEvent[] = [
      {
        requestId,
        type: 'extraction_alert_cleared',
        occurredAt: at,
        actor: { actorType: 'system' },
        payload: {
          outcome: 're_ran',
          assignedReviewerId: 'a',
          clearingReviewerId: null,
          rerunAttempts: 1,
        },
      },
      {
        requestId,
        type: 'collection_lapse_cleared',
        occurredAt: at,
        actor: { actorType: 'reviewer', reviewerId: 'b' },
        payload: {
          outcome: 'reached_requester',
          assignedReviewerId: 'a',
          clearingReviewerId: 'b',
        },
      },
    ];
    expect(events).toHaveLength(2);
  });

  it('rejects a system actor writing a reviewer outcome', () => {
    // @ts-expect-error `abandoned` is a Reviewer's outcome, not the system's
    const wrong: RequestEvent = {
      requestId,
      type: 'extraction_alert_cleared',
      occurredAt: at,
      actor: { actorType: 'system' },
      payload: {
        outcome: 'abandoned',
        assignedReviewerId: 'a',
        clearingReviewerId: 'b',
        rerunAttempts: 0,
      },
    };
    expect(wrong).toBeDefined();
  });

  it('rejects an actor kind the type does not allow', () => {
    // @ts-expect-error `submitted` is written by a requester
    const wrong: RequestEvent = {
      requestId,
      type: 'submitted',
      occurredAt: at,
      actor: { actorType: 'system' },
      payload: {},
    };
    expect(wrong).toBeDefined();
  });
});
