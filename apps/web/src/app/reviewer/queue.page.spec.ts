import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { getLocale, overwriteGetLocale } from '../../paraglide/runtime.js';
import { type AlertRow, type QueueList, type QueueRow } from './queue-api';
import { QueuePage } from './queue.page';

const row = (id: string, over: Partial<QueueRow> = {}): QueueRow => ({
  id,
  reference: `REQ-${id}`,
  submittedAt: '2026-09-21T02:00:00.000Z',
  expiresAt: '2026-09-24T02:00:00.000Z',
  minutesLeft: 21 * 60,
  expired: false,
  ahead: 0,
  requesterName: `Name ${id}`,
  diseaseGroupName: 'โรคซิลิโคสิส',
  ...over,
});

const alert = (requestId: string, over: Partial<AlertRow> = {}): AlertRow => ({
  requestId,
  reference: `REQ-${requestId}`,
  requesterName: `Name ${requestId}`,
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

const list = (
  requests: QueueRow[],
  automaticProcessing: QueueList['automaticProcessing'] = 'running',
  alerts: AlertRow[] = [],
): QueueList => ({
  generatedAt: '2026-09-21T05:00:00.000Z',
  automaticProcessing,
  requests,
  alerts,
});

describe('QueuePage', () => {
  let fixture: ComponentFixture<QueuePage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    TestBed.configureTestingModule({
      imports: [QueuePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(QueuePage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  async function settle(on: ComponentFixture<QueuePage> = fixture) {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await on.whenStable();
  }

  async function firstLoad(requests: QueueRow[]) {
    http.expectOne('/api/reviewer/queue').flush(list(requests));
    await settle();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ');
  const rows = () => [...el.querySelectorAll('nav li a')];
  const refresh = () => el.querySelector<HTMLButtonElement>('button.refresh')!;

  it('lists pending Requests in the order the server gave, oldest first', async () => {
    await firstLoad([row('a'), row('b'), row('c')]);
    expect(rows().map((r) => r.querySelector('.ref')?.textContent)).toEqual([
      'REQ-a',
      'REQ-b',
      'REQ-c',
    ]);
    expect(text()).toContain(m.reviewer_queue_count({ count: 3 }));
  });

  it('shows on each row who, what, and the time left as N h NN m', async () => {
    await firstLoad([row('a', { minutesLeft: 21 * 60 + 5 })]);
    expect(text()).toContain('Name a');
    expect(text()).toContain('โรคซิลิโคสิส');
    expect(text()).toContain('21 h 05 m');
  });

  it('marks a Request past the threshold with a word, not a colour', async () => {
    await firstLoad([row('a', { expired: true, minutesLeft: 0, ahead: null })]);
    expect(rows()[0].textContent).toContain(m.reviewer_clock_expired());
  });

  it('keeps the queue in a landmark that leaves room for the zones beside it', async () => {
    await firstLoad([row('a')]);
    const nav = el.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe(m.reviewer_queue_heading());
    expect(nav.closest('aside')).not.toBeNull();
  });

  it('says the desk is clear when nothing is pending', async () => {
    await firstLoad([]);
    expect(text()).toContain(m.reviewer_empty_clear_title());
    expect(text()).toContain(m.reviewer_empty_clear_note());
  });

  describe('the Alerts zone (§10.6)', () => {
    async function loadWithAlerts(requests: QueueRow[], alerts: AlertRow[]) {
      http
        .expectOne('/api/reviewer/queue')
        .flush(list(requests, 'running', alerts));
      await settle();
    }
    const zone = () =>
      el.querySelector<HTMLElement>(
        `section[aria-label="${m.reviewer_alerts_heading()}"]`,
      );
    const cards = () => [...(zone()?.querySelectorAll('li a') ?? [])];

    it('puts one card per Alert in its own zone, apart from the queue', async () => {
      await loadWithAlerts(
        [row('a')],
        [
          alert('x'),
          alert('y', {
            kind: 'extraction_failure',
            outcomes: ['contacted_requester', 'abandoned'],
          }),
        ],
      );
      expect(cards()).toHaveLength(2);
      const first = cards()[0].textContent!;
      expect(first).toContain(m.reviewer_alert_lapse_title());
      expect(first).toContain('REQ-x');
      expect(first).toContain('Name x');
      expect(first).toContain(
        m.reviewer_alert_assigned_to({ reviewer: 'Alice Reviewer' }),
      );
      expect(cards()[1].textContent).toContain(
        m.reviewer_alert_extraction_title(),
      );
      // Never on the queue's own list as well.
      expect(rows().some((r) => r.textContent!.includes('REQ-x'))).toBe(false);
    });

    it('shows no zone at all when nothing is outstanding', async () => {
      await loadWithAlerts([row('a')], []);
      expect(zone()).toBeNull();
    });

    it('says the work is not finished when the queue is empty but Alerts are open', async () => {
      await loadWithAlerts([], [alert('x'), alert('y')]);
      expect(text()).toContain(m.reviewer_empty_alerts_title({ count: 2 }));
      expect(text()).toContain(m.reviewer_empty_alerts_note());
      expect(text()).not.toContain(m.reviewer_empty_clear_detail());
    });
  });

  it('says plainly that the page does not update itself', async () => {
    await firstLoad([row('a')]);
    expect(text()).toContain(m.reviewer_queue_no_autorefresh());
  });

  it('never polls: an hour of waiting makes no further request', async () => {
    await firstLoad([row('a')]);
    vi.advanceTimersByTime(60 * 60 * 1000);
    await settle();
    http.expectNone(() => true);
  });

  it('tells how stale the list is, ticking without asking the server', async () => {
    await firstLoad([row('a')]);
    expect(text()).toContain(
      m.reviewer_queue_staleness({ minutes: 0, changes: 0 }),
    );
    vi.advanceTimersByTime(5 * 60 * 1000);
    await settle();
    expect(text()).toContain(
      m.reviewer_queue_staleness({ minutes: 5, changes: 0 }),
    );
    http.expectNone(() => true);
  });

  it('reloads on demand, keeping the old list visible while it loads', async () => {
    await firstLoad([row('a')]);
    vi.advanceTimersByTime(3 * 60 * 1000);
    refresh().click();
    await settle();

    expect(refresh().textContent).toContain(m.reviewer_queue_refresh_loading());
    expect(refresh().getAttribute('aria-busy')).toBe('true');
    expect(rows()).toHaveLength(1);
    expect(text()).toContain(m.reviewer_queue_refresh_stale({ minutes: 3 }));

    // A second press while loading is ignored.
    refresh().click();
    await settle();
    http.expectOne('/api/reviewer/queue').flush(list([row('a'), row('b')]));
    await settle();
    expect(rows()).toHaveLength(2);
    expect(text()).toContain(
      m.reviewer_queue_staleness({ minutes: 0, changes: 1 }),
    );
    expect(refresh().getAttribute('aria-busy')).toBeNull();
  });

  it('says how old the list is when a reload fails, and keeps it', async () => {
    await firstLoad([row('a')]);
    vi.advanceTimersByTime(8 * 60 * 1000);
    refresh().click();
    await settle();
    http
      .expectOne('/api/reviewer/queue')
      .flush('', { status: 500, statusText: 'Error' });
    await settle();

    expect(rows()).toHaveLength(1);
    expect(text()).toContain(m.reviewer_queue_refresh_failed());
    expect(text()).toContain(
      m.reviewer_queue_refresh_failed_detail({ minutes: 8 }),
    );
    expect(refresh().getAttribute('aria-busy')).toBeNull();
  });

  it('offers a retry when the very first load fails', async () => {
    http
      .expectOne('/api/reviewer/queue')
      .flush('', { status: 500, statusText: 'Error' });
    await settle();
    expect(text()).toContain(m.reviewer_queue_load_failed());
    expect(text()).not.toContain(m.reviewer_empty_clear_title());
    expect(refresh()).not.toBeNull();
  });

  it('says plainly, with no error code, that automatic processing has stopped', async () => {
    http.expectOne('/api/reviewer/queue').flush(list([row('a')], 'stopped'));
    await settle();

    const banner = el.querySelector('[role="alert"].scheduler-stopped');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain(m.reviewer_scheduler_stopped_title());
    expect(banner!.textContent).toContain(
      m.reviewer_scheduler_stopped_detail(),
    );
    expect(banner!.textContent).not.toMatch(/\b\d{3}\b|error|code/i);
  });

  it('renders the banner in the Thai catalogue’s own wording, with no error code', async () => {
    const th = { locale: 'th' } as const;
    const title = m.reviewer_scheduler_stopped_title({}, th);
    const detail = m.reviewer_scheduler_stopped_detail({}, th);
    // A missing `th` key falls back to English: prove these are translations.
    expect(title).not.toBe(
      m.reviewer_scheduler_stopped_title({}, { locale: 'en' }),
    );
    expect(detail).not.toBe(
      m.reviewer_scheduler_stopped_detail({}, { locale: 'en' }),
    );

    const originalGetLocale = getLocale;
    overwriteGetLocale(() => 'th');
    try {
      const thai = TestBed.createComponent(QueuePage);
      for (const req of http.match('/api/reviewer/queue')) {
        req.flush(list([row('a')], 'stopped'));
      }
      await settle(thai);

      const banner = (thai.nativeElement as HTMLElement).querySelector(
        '[role="alert"].scheduler-stopped',
      );
      expect(banner!.textContent).toContain(title);
      expect(banner!.textContent).toContain(detail);
      expect(banner!.textContent).not.toMatch(/\b\d{3}\b|error|code/i);
    } finally {
      overwriteGetLocale(originalGetLocale);
    }
  });

  it('shows no banner while automatic processing is running', async () => {
    await firstLoad([row('a')]);
    expect(el.querySelector('.scheduler-stopped')).toBeNull();
  });

  it('shows no drain estimate and no history anywhere', async () => {
    await firstLoad([row('a', { ahead: 4 })]);
    expect(text()).not.toMatch(/~\s*\d+\s*min|will start|estimate|history/i);
  });
});
