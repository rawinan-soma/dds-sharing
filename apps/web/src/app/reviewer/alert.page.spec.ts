import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  type ParamMap,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import * as m from '../../paraglide/messages.js';
import { AlertPage } from './alert.page';
import { type AlertDetail, type AlertRow } from './queue-api';
import { QueueStore } from './queue-store';

const lapse = (over: Partial<AlertRow> = {}): AlertRow => ({
  requestId: 'r1',
  reference: 'REQ-2569-0001',
  requesterName: 'Somchai Jaidee',
  kind: 'collection_lapse',
  raisedAt: '2026-09-21T02:00:00.000Z',
  deferred: false,
  rerunAttempts: 0,
  assignedTo: { displayName: 'Alice Reviewer', active: true },
  outcomes: [
    'reached_requester',
    'could_not_reach_requester',
    'no_action_needed',
  ],
  clearable: true,
  silentHours: 26,
  ...over,
});

const failure = (over: Partial<AlertRow> = {}): AlertRow =>
  lapse({
    kind: 'extraction_failure',
    outcomes: ['contacted_requester', 'abandoned'],
    silentHours: null,
    ...over,
  });

const detail = (alerts: AlertRow[]): AlertDetail => ({
  alerts,
  contact: {
    name: 'Somchai',
    surname: 'Jaidee',
    tel: '081 234 5678',
    email: 'somchai@example.go.th',
    workplace: 'Regional Office 1',
  },
});

describe('AlertPage', () => {
  let fixture: ComponentFixture<AlertPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AlertPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject<ParamMap>(
              convertToParamMap({ id: 'r1' }),
            ),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AlertPage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function load(alerts: AlertRow[]) {
    http.expectOne('/api/reviewer/alerts/r1').flush(detail(alerts));
    await settle();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ');
  const buttons = () =>
    [...el.querySelectorAll<HTMLButtonElement>('.outcomes button')].map((b) =>
      b.textContent!.trim(),
    );

  it('shows the silence in words, the number to ring, and whose it is', async () => {
    await load([lapse()]);
    expect(text()).toContain(m.reviewer_alert_lapse_title());
    expect(text()).toContain(m.reviewer_alert_lapse_detail({ hours: 26 }));
    expect(text()).toContain('081 234 5678');
    expect(text()).toContain(
      m.reviewer_alert_assigned_to({ reviewer: 'Alice Reviewer' }),
    );
  });

  it('offers exactly the kind’s closed set, and no way to type anything', async () => {
    await load([lapse()]);
    expect(buttons()).toEqual([
      m.reviewer_alert_outcome_reached(),
      m.reviewer_alert_outcome_unreachable(),
      m.reviewer_alert_outcome_no_action(),
    ]);
    expect(text()).toContain(m.reviewer_alert_closed_set_note());
    expect(
      el.querySelector('input, textarea, select, [contenteditable]'),
    ).toBeNull();
  });

  it('offers an extraction failure its two outcomes, never re-ran', async () => {
    await load([failure()]);
    expect(buttons()).toEqual([
      m.reviewer_alert_outcome_contacted(),
      m.reviewer_alert_outcome_abandoned(),
    ]);
  });

  it('clears with the chosen outcome, then drops the card from the zone', async () => {
    const store = TestBed.inject(QueueStore);
    store.alerts.set([lapse(), failure({ requestId: 'r2' })]);
    await load([lapse()]);

    el.querySelectorAll<HTMLButtonElement>('.outcomes button')[1].click();
    const req = http.expectOne('/api/reviewer/alerts/r1/clear');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      kind: 'collection_lapse',
      outcome: 'could_not_reach_requester',
    });
    req.flush({ clearedAt: '2026-09-22T03:00:00.000Z', zone: 'in_flight' });
    await settle();

    expect(text()).toContain(m.reviewer_alert_cleared_in_flight());
    expect(buttons()).toEqual([]);
    expect(store.alerts()!.map((a) => a.requestId)).toEqual(['r2']);
  });

  it('puts the pressed button into its loading form while it saves', async () => {
    await load([lapse()]);
    const pressed = () =>
      el.querySelectorAll<HTMLButtonElement>('.outcomes button')[0];
    pressed().click();
    await settle();
    expect(pressed().textContent!.trim()).toBe(m.reviewer_alert_clearing());
    expect(pressed().getAttribute('aria-busy')).toBe('true');
    http
      .expectOne('/api/reviewer/alerts/r1/clear')
      .flush({ clearedAt: '2026-09-22T03:00:00.000Z', zone: 'in_flight' });
    await settle();
  });

  it('says a Re-run is under way, not that the Alert is gone, when one started meanwhile', async () => {
    await load([failure()]);
    el.querySelectorAll<HTMLButtonElement>('.outcomes button')[0].click();
    http
      .expectOne('/api/reviewer/alerts/r1/clear')
      .flush({ error: 'deferred' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text()).toContain(m.reviewer_alert_rerunning({ attempts: 1 }));
    expect(text()).not.toContain(m.reviewer_alert_gone());
    expect(buttons()).toEqual([]);
  });

  it('shows no contact fields once the Request is terminal (ADR 0015)', async () => {
    http
      .expectOne('/api/reviewer/alerts/r1')
      .flush({ ...detail([lapse()]), contact: null });
    await settle();
    expect(text()).not.toContain('081 234 5678');
    expect(text()).toContain(m.reviewer_alert_lapse_title());
  });

  it('says when clearing was the last thing to do', async () => {
    await load([failure()]);
    el.querySelectorAll<HTMLButtonElement>('.outcomes button')[1].click();
    http
      .expectOne('/api/reviewer/alerts/r1/clear')
      .flush({ clearedAt: '2026-09-22T03:00:00.000Z', zone: null });
    await settle();
    expect(text()).toContain(m.reviewer_alert_cleared_ended());
  });

  it('shows another Reviewer’s by-name Alert without its buttons, saying whose it is', async () => {
    await load([lapse({ clearable: false })]);
    expect(buttons()).toEqual([]);
    expect(text()).toContain(
      m.reviewer_alert_assigned_only({ reviewer: 'Alice Reviewer' }),
    );
  });

  it('says a deactivated assignee’s Alert is open to anyone, keeping their name', async () => {
    await load([
      lapse({ assignedTo: { displayName: 'Alice Reviewer', active: false } }),
    ]);
    expect(buttons()).toHaveLength(3);
    expect(text()).toContain(
      m.reviewer_alert_assigned_inactive({ reviewer: 'Alice Reviewer' }),
    );
  });

  it('holds a deferred extraction failure open with nothing to choose', async () => {
    await load([
      failure({ deferred: true, rerunAttempts: 1, clearable: false }),
    ]);
    expect(buttons()).toEqual([]);
    expect(text()).toContain(m.reviewer_alert_rerunning({ attempts: 1 }));
  });

  it('says so when the Alert is no longer open', async () => {
    http
      .expectOne('/api/reviewer/alerts/r1')
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(text()).toContain(m.reviewer_alert_gone());
  });

  describe('Re-run on an extraction failure (§10.9)', () => {
    const rerunButton = () =>
      el.querySelector<HTMLButtonElement>('button.rerun');

    it('offers Re-run beside the clearing outcomes, and never on a delivery Alert', async () => {
      await load([failure(), lapse({ kind: 'send_abandoned' })]);
      expect(el.querySelectorAll('button.rerun')).toHaveLength(1);
      expect(text()).toContain(m.reviewer_rerun_note());
    });

    it('defers the Alert once pressed: nothing to choose until the Re-run settles', async () => {
      await load([failure()]);
      rerunButton()!.click();
      await fixture.whenStable();
      expect(rerunButton()!.textContent!.trim()).toBe(
        m.reviewer_rerun_loading(),
      );
      const req = http.expectOne('/api/reviewer/requests/r1/rerun');
      expect(req.request.body).toEqual({});
      req.flush({ queuedAt: '2026-09-22T03:00:00.000Z' });
      await settle();
      expect(text()).toContain(m.reviewer_alert_rerunning({ attempts: 1 }));
      expect(buttons()).toEqual([]);
      expect(rerunButton()).toBeNull();
    });

    it('offers no Re-run while one is already under way', async () => {
      await load([
        failure({ deferred: true, rerunAttempts: 1, clearable: false }),
      ]);
      expect(rerunButton()).toBeNull();
    });

    it('says so when the Re-run could not be started', async () => {
      await load([failure()]);
      rerunButton()!.click();
      http
        .expectOne('/api/reviewer/requests/r1/rerun')
        .flush('', { status: 500, statusText: 'Error' });
      await settle();
      expect(text()).toContain(m.reviewer_rerun_failed());
      expect(buttons()).toHaveLength(2);
    });
  });
});
