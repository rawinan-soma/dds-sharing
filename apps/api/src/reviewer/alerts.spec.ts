import { describe, expect, it } from 'vitest';
import { type RequestEventType } from '../audit/event-catalogue';
import { ALERT_OUTCOMES, mayClear, openAlerts } from './alerts';

const ict = (local: string) => new Date(`${local}:00+07:00`);

// A Request's events in the order they were recorded.
const stream = (...entries: [RequestEventType, string][]) =>
  entries.map(([type, at], i) => ({ id: i + 1, type, occurredAt: ict(at) }));

describe('openAlerts (§10.6)', () => {
  it('opens an extraction-failure Alert when a job fails', () => {
    const alerts = openAlerts(
      stream(
        ['approved', '2026-09-21T09:00'],
        ['job_failed', '2026-09-21T09:30'],
        ['extraction_alert_raised', '2026-09-21T09:30'],
      ),
    );
    expect(alerts).toEqual([
      {
        kind: 'extraction_failure',
        raisedAt: ict('2026-09-21T09:30'),
        deferred: false,
        rerunAttempts: 0,
      },
    ]);
  });

  it('closes it once it is cleared', () => {
    const alerts = openAlerts(
      stream(
        ['job_failed', '2026-09-21T09:30'],
        ['extraction_alert_raised', '2026-09-21T09:30'],
        ['extraction_alert_cleared', '2026-09-21T10:00'],
      ),
    );
    expect(alerts).toEqual([]);
  });

  it('opens a collection lapse, and closes it on collection_lapse_cleared', () => {
    const raised = stream(
      ['mail_sent', '2026-09-21T10:00'],
      ['collection_lapse_raised', '2026-09-22T10:00'],
    );
    expect(openAlerts(raised)).toEqual([
      {
        kind: 'collection_lapse',
        raisedAt: ict('2026-09-22T10:00'),
        deferred: false,
        rerunAttempts: 0,
      },
    ]);
    expect(
      openAlerts([
        ...raised,
        {
          id: 3,
          type: 'collection_lapse_cleared',
          occurredAt: ict('2026-09-22T11:00'),
        },
      ]),
    ).toEqual([]);
  });

  // The catalogue is closed and has no `delivery_alert_cleared`: a send
  // abandoned is cleared with the collection lapse's outcomes and its event.
  it('opens a send-abandoned Alert, cleared by collection_lapse_cleared', () => {
    const raised = stream(
      ['mail_send_abandoned', '2026-09-21T10:00'],
      ['delivery_alert_raised', '2026-09-21T10:00'],
    );
    expect(openAlerts(raised).map((a) => a.kind)).toEqual(['send_abandoned']);
    expect(
      openAlerts([
        ...raised,
        {
          id: 3,
          type: 'collection_lapse_cleared',
          occurredAt: ict('2026-09-21T11:00'),
        },
      ]),
    ).toEqual([]);
  });

  it('never opens one for a stalled or abandoned Probe', () => {
    const alerts = openAlerts(
      stream(
        ['submitted', '2026-09-21T09:00'],
        ['probe_failed', '2026-09-21T09:05'],
        ['approved', '2026-09-21T09:30'],
        ['job_queued', '2026-09-21T09:30'],
      ),
    );
    expect(alerts).toEqual([]);
  });

  describe('a Re-run defers the Alert rather than clearing it (ADR 0014)', () => {
    const failedThenRerun = [
      ['job_failed', '2026-09-21T09:30'],
      ['extraction_alert_raised', '2026-09-21T09:30'],
      ['extraction_rerun_queued', '2026-09-21T10:00'],
    ] as [RequestEventType, string][];

    it('stays open, marked deferred, counting the attempt', () => {
      const [alert] = openAlerts(stream(...failedThenRerun));
      expect(alert).toMatchObject({ deferred: true, rerunAttempts: 1 });
    });

    it('a failed re-run leaves the same Alert open, no longer deferred', () => {
      const alerts = openAlerts(
        stream(
          ...failedThenRerun,
          ['job_failed', '2026-09-21T10:30'],
          // A writer that raised again would not make it a second Alert.
          ['extraction_alert_raised', '2026-09-21T10:30'],
        ),
      );
      expect(alerts).toEqual([
        {
          kind: 'extraction_failure',
          raisedAt: ict('2026-09-21T09:30'),
          deferred: false,
          rerunAttempts: 1,
        },
      ]);
    });
  });
});

describe('mayClear: assignment and clearing are two things (ADR 0013)', () => {
  const alice = { id: 'alice', deactivatedAt: null };
  const gone = { id: 'alice', deactivatedAt: ict('2026-09-22T09:00') };

  it.each(['collection_lapse', 'send_abandoned'] as const)(
    'a %s is the approving Reviewer’s alone while they are active',
    (kind) => {
      expect(mayClear(kind, alice, 'alice')).toBe(true);
      expect(mayClear(kind, alice, 'bob')).toBe(false);
    },
  );

  it.each(['collection_lapse', 'send_abandoned'] as const)(
    'a %s widens to any active Reviewer once theirs is deactivated',
    (kind) => {
      expect(mayClear(kind, gone, 'bob')).toBe(true);
    },
  );

  it('an extraction failure is clearable by any active Reviewer', () => {
    expect(mayClear('extraction_failure', alice, 'bob')).toBe(true);
  });
});

describe('ALERT_OUTCOMES: the closed sets (§10.6)', () => {
  it('never offers re_ran to a Reviewer (ADR 0014)', () => {
    expect(ALERT_OUTCOMES.extraction_failure).toEqual([
      'contacted_requester',
      'abandoned',
    ]);
  });

  it('gives a send abandoned the collection lapse’s three outcomes', () => {
    const three = [
      'reached_requester',
      'could_not_reach_requester',
      'no_action_needed',
    ];
    expect(ALERT_OUTCOMES.collection_lapse).toEqual(three);
    expect(ALERT_OUTCOMES.send_abandoned).toEqual(three);
  });
});
