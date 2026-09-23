import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { type QueueList, type QueueRow } from './queue-api';
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

const list = (
  requests: QueueRow[],
  automaticProcessing: QueueList['automaticProcessing'] = 'running',
): QueueList => ({
  generatedAt: '2026-09-21T05:00:00.000Z',
  automaticProcessing,
  requests,
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

  async function settle() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await fixture.whenStable();
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

  it('shows no banner while automatic processing is running', async () => {
    await firstLoad([row('a')]);
    expect(el.querySelector('.scheduler-stopped')).toBeNull();
  });

  it('shows no drain estimate and no history anywhere', async () => {
    await firstLoad([row('a', { ahead: 4 })]);
    expect(text()).not.toMatch(/~\s*\d+\s*min|will start|estimate|history/i);
  });
});
