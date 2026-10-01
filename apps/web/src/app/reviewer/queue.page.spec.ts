import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { getLocale, overwriteGetLocale } from '../../paraglide/runtime.js';
import {
  type AlertRow,
  type InFlightRow,
  type QueueList,
  type QueueRow,
} from './queue-api';
import { QueuePage } from './queue.page';
import { QueueStore } from './queue-store';

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

const inFlightRow = (
  requestId: string,
  over: Partial<InFlightRow> = {},
): InFlightRow => ({
  requestId,
  reference: `REQ-${requestId}`,
  submittedAt: '2026-09-20T02:00:00.000Z',
  requesterName: `Name ${requestId}`,
  diseaseGroupName: 'โรคซิลิโคสิส',
  extraction: 'ready',
  linkExpiresAt: null,
  actions: { rerun: true, resend: true },
  ...over,
});

const list = (
  requests: QueueRow[],
  automaticProcessing: QueueList['automaticProcessing'] = 'running',
  alerts: AlertRow[] = [],
  inFlight: InFlightRow[] = [],
): QueueList => ({
  generatedAt: '2026-09-21T05:00:00.000Z',
  automaticProcessing,
  requests,
  alerts,
  inFlight,
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
  // The rows of whichever zone's table is showing.
  const rows = () => [
    ...el.querySelectorAll<HTMLTableRowElement>('[role=tabpanel] tbody tr'),
  ];
  const rowHeaders = () =>
    rows().map((r) => r.querySelector('th')!.textContent!.trim());
  const refresh = () => el.querySelector<HTMLButtonElement>('button.refresh')!;
  const tabs = () => [...el.querySelectorAll<HTMLElement>('[role=tab]')];
  const tabNamed = (label: string) =>
    tabs().find((t) => t.textContent!.includes(label))!;
  async function openTab(label: string) {
    tabNamed(label).click();
    await settle();
  }

  it('puts the lookup by reference in the queue band, between the staleness line and refresh', async () => {
    await firstLoad([row('a')]);
    const band = el.querySelector('.queue-band')!;
    const search = band.querySelector('app-lookup-search')!;
    const staleness = band.querySelector('.staleness')!;
    expect(
      staleness.compareDocumentPosition(search) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      search.compareDocumentPosition(refresh()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('lists pending Requests in the order the server gave, oldest first', async () => {
    await firstLoad([row('a'), row('b'), row('c')]);
    expect(rowHeaders()).toEqual(['Name a', 'Name b', 'Name c']);
    expect(tabNamed(m.reviewer_zone_queue()).textContent).toContain('3');
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

  it('reads the queue as a table, each row headed by a link to its dossier', async () => {
    await firstLoad([row('a'), row('b')]);
    const table = el.querySelector('[role=tabpanel] table')!;
    expect(table).not.toBeNull();
    for (const header of table.querySelectorAll('thead th')) {
      expect(header.getAttribute('scope')).toBe('col');
    }
    const first = rows()[0].querySelector('th')!;
    expect(first.getAttribute('scope')).toBe('row');
    const link = first.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/a');
  });

  describe('the zone tabs', () => {
    it('are one tablist of three tabs, each with its count, over one tabpanel', async () => {
      http
        .expectOne('/api/reviewer/queue')
        .flush(
          list(
            [row('a'), row('b')],
            'running',
            [alert('x')],
            [inFlightRow('y'), inFlightRow('z'), inFlightRow('w')],
          ),
        );
      await settle();
      expect(el.querySelectorAll('[role=tablist]')).toHaveLength(1);
      expect(
        tabs().map((t) => t.textContent!.replace(/\s+/g, ' ').trim()),
      ).toEqual([
        `${m.reviewer_zone_queue()} · 2`,
        `${m.reviewer_alerts_heading()} · 1`,
        `${m.reviewer_inflight_heading()} · 3`,
      ]);
      const panel = el.querySelector('[role=tabpanel]')!;
      const selected = tabs().find(
        (t) => t.getAttribute('aria-selected') === 'true',
      )!;
      expect(panel.getAttribute('aria-labelledby')).toBe(selected.id);
      expect(selected.getAttribute('aria-controls')).toBe(panel.id);
    });

    it('take one tab stop, and arrow keys move between them', async () => {
      await firstLoad([row('a')]);
      expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);

      tabs()[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await settle();
      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
      expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
      expect(document.activeElement).toBe(tabs()[1]);

      tabs()[1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
      tabs()[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
      await settle();
      expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    });

    it('follow the zone named in the address, as the 11c link sets it', async () => {
      await firstLoad([row('a')]);
      await TestBed.inject(Router).navigate([], {
        queryParams: { zone: 'in-flight' },
      });
      await settle();
      expect(
        tabNamed(m.reviewer_inflight_heading()).getAttribute('aria-selected'),
      ).toBe('true');
    });

    it('show the selected zone only, so a Request appears in exactly one place', async () => {
      http
        .expectOne('/api/reviewer/queue')
        .flush(list([row('a')], 'running', [alert('x')], [inFlightRow('y')]));
      await settle();
      expect(rowHeaders()).toEqual(['Name a']);
      await openTab(m.reviewer_alerts_heading());
      expect(text()).not.toContain('Name a');
      expect(text()).toContain('Name x');
    });
  });

  it('heads the surface with the signed-in Reviewer and sign-out', async () => {
    await firstLoad([row('a')]);
    const header = el.querySelector('header')!;
    expect(header.textContent).toContain(m.reviewer_brand());
    expect(header.textContent).toContain(m.reviewer_signout());
  });

  it('says the desk is clear when nothing is pending, in place of the table', async () => {
    await firstLoad([]);
    expect(text()).toContain(m.reviewer_empty_clear_title());
    expect(text()).toContain(m.reviewer_empty_clear_note());
    expect(el.querySelector('[role=tabpanel] table')).toBeNull();
  });

  describe('the Alerts zone (§10.6)', () => {
    async function loadWithAlerts(requests: QueueRow[], alerts: AlertRow[]) {
      http
        .expectOne('/api/reviewer/queue')
        .flush(list(requests, 'running', alerts));
      await settle();
    }
    it('puts one row per Alert in its own zone, apart from the queue', async () => {
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
      // Never on the queue's own table as well.
      expect(rows().some((r) => r.textContent!.includes('Name x'))).toBe(false);

      await openTab(m.reviewer_alerts_heading());
      expect(rows()).toHaveLength(2);
      const first = rows()[0].textContent!;
      expect(first).toContain(m.reviewer_alert_lapse_title());
      expect(first).toContain('REQ-x');
      expect(first).toContain('Name x');
      expect(first).toContain('Alice Reviewer');
      expect(rows()[1].textContent).toContain(
        m.reviewer_alert_extraction_title(),
      );
      expect(rows()[0].querySelector('th a')!.getAttribute('href')).toBe(
        '/alerts/x',
      );
    });

    it('marks the tab in pending ink only while it has a count', async () => {
      await loadWithAlerts([row('a')], [alert('x')]);
      expect(tabNamed(m.reviewer_alerts_heading()).classList).toContain(
        'outstanding',
      );
    });

    it('says so in place of the table when nothing is outstanding', async () => {
      await loadWithAlerts([row('a')], []);
      expect(tabNamed(m.reviewer_alerts_heading()).classList).not.toContain(
        'outstanding',
      );
      await openTab(m.reviewer_alerts_heading());
      expect(rows()).toHaveLength(0);
      expect(text()).toContain(m.reviewer_zone_alerts_empty());
    });

    it('says the work is not finished when the queue is empty but Alerts are open', async () => {
      await loadWithAlerts([], [alert('x'), alert('y')]);
      expect(text()).toContain(m.reviewer_empty_alerts_title());
      expect(text()).toContain(m.reviewer_empty_alerts_count({ count: 2 }));
      expect(text()).not.toContain(m.reviewer_empty_clear_detail());

      const go = [...el.querySelectorAll('button')].find(
        (b) => b.textContent!.trim() === m.reviewer_empty_alerts_action(),
      )!;
      go.click();
      await settle();
      expect(
        tabNamed(m.reviewer_alerts_heading()).getAttribute('aria-selected'),
      ).toBe('true');
      expect(rows()).toHaveLength(2);
    });
  });

  describe('the in-flight zone (§10.9)', () => {
    async function loadInFlight(inFlight: InFlightRow[]) {
      http
        .expectOne('/api/reviewer/queue')
        .flush(list([row('a')], 'running', [], inFlight));
      await settle();
      await openTab(m.reviewer_inflight_heading());
    }
    const zone = () => el.querySelector<HTMLElement>('[role=tabpanel]');
    const entries = rows;

    it('lists approved Requests in the order the server gave, apart from the queue', async () => {
      await loadInFlight([inFlightRow('x'), inFlightRow('y')]);
      expect(rowHeaders()).toEqual(['REQ-x', 'REQ-y']);
      expect(entries()[0].textContent).toContain('Name x');
      expect(zone()!.textContent).toContain(
        m.reviewer_inflight_suppression_note({ count: 0 }),
      );
      await openTab(m.reviewer_zone_queue());
      expect(rows().some((r) => r.textContent!.includes('Name x'))).toBe(false);
    });

    it('reads a queued or running job as extracting, and a failure as failed', async () => {
      await loadInFlight([
        inFlightRow('x', {
          extraction: 'extracting',
          actions: { rerun: false, resend: false },
        }),
        inFlightRow('y', {
          extraction: 'failed',
          actions: { rerun: true, resend: false },
        }),
      ]);
      expect(entries()[0].querySelector('.tag')!.textContent).toContain(
        m.reviewer_state_extracting(),
      );
      // Why nothing can be pressed, said on the row.
      expect(entries()[0].textContent).toContain(
        m.reviewer_inflight_extracting_note(),
      );
      expect(entries()[1].querySelector('.tag')!.textContent).toContain(
        m.reviewer_state_failed(),
      );
    });

    it('shows the wall-clock time left on a ready link, ticking without asking the server', async () => {
      const expires = new Date(Date.now() + (47 * 60 + 5) * 60_000);
      await loadInFlight([
        inFlightRow('x', { linkExpiresAt: expires.toISOString() }),
      ]);
      expect(entries()[0].textContent).toContain(
        m.reviewer_inflight_link_left({ time: '47 h 05 m' }),
      );
      vi.advanceTimersByTime(60 * 60 * 1000);
      await settle();
      expect(entries()[0].textContent).toContain(
        m.reviewer_inflight_link_left({ time: '46 h 05 m' }),
      );
      http.expectNone(() => true);
    });

    it('never names the approving Reviewer on the row', async () => {
      await loadInFlight([inFlightRow('x')]);
      expect(zone()!.textContent).not.toContain(
        m.reviewer_approved_by({ reviewer: '' }).trim(),
      );
    });

    it('marks a Request approved on this screen as known only here until refresh', async () => {
      await loadInFlight([inFlightRow('x')]);
      TestBed.inject(QueueStore).approvePending('a');
      await settle();
      const local = rows().find((r) => r.textContent!.includes('Name a'))!;
      expect(local.querySelector('.tag')!.textContent).toContain(
        m.reviewer_state_just_approved(),
      );
      expect(local.textContent).toContain(m.reviewer_inflight_local_note());
      // Never a guessed extraction state.
      expect(local.textContent).not.toContain(m.reviewer_state_extracting());

      refresh().click();
      await settle();
      http
        .expectOne('/api/reviewer/queue')
        .flush(list([], 'running', [], [inFlightRow('x'), inFlightRow('a')]));
      await settle();
      const read = rows().find((r) => r.textContent!.includes('REQ-a'))!;
      expect(read.textContent).not.toContain(m.reviewer_inflight_local_note());
    });

    it('says so in place of the table when nothing is in flight', async () => {
      await loadInFlight([]);
      expect(rows()).toHaveLength(0);
      expect(text()).toContain(m.reviewer_zone_inflight_empty());
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
    expect(el.querySelector('.staleness')!.classList).toContain('failed-text');
    expect(refresh().textContent).toContain(m.reviewer_queue_retry());
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
