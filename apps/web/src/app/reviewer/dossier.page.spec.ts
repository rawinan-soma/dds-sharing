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
import { DossierPage } from './dossier.page';
import { type Dossier } from './queue-api';

const dossier = (over: Partial<Dossier> = {}): Dossier => ({
  id: 'r1',
  reference: 'REQ-2569-0001',
  submittedAt: '2026-09-21T02:00:00.000Z', // 09:00 ICT
  expiresAt: '2026-09-24T02:00:00.000Z',
  minutesLeft: 21 * 60 + 5,
  expired: false,
  ahead: 3,
  requesterName: 'Somchai Jaidee',
  diseaseGroupName: 'โรคซิลิโคสิส',
  contact: {
    name: 'Somchai',
    surname: 'Jaidee',
    tel: '081 234 5678',
    email: 'somchai@example.go.th',
    workplace: 'Regional Office 1',
  },
  reportCodes: ['202', '203'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  area: {
    kind: 'provinces',
    provinces: [{ id: '50', name: 'เชียงใหม่' }],
    region: null,
  },
  rowCount: 'pending',
  ...over,
});

describe('DossierPage', () => {
  let fixture: ComponentFixture<DossierPage>;
  let http: HttpTestingController;
  let params: BehaviorSubject<ParamMap>;
  let el: HTMLElement;

  const paramMap = (id: string) => convertToParamMap({ id });

  beforeEach(async () => {
    params = new BehaviorSubject(paramMap('r1'));
    TestBed.configureTestingModule({
      imports: [DossierPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DossierPage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  // The page awaits a promise, which the test's flush resolves outside
  // Angular's view: let it run, then let the view catch up.
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function load(over: Partial<Dossier> = {}) {
    http.expectOne('/api/reviewer/queue/r1').flush(dossier(over));
    await settle();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ');

  it('asks for the one Request the route names', () => {
    http.expectOne('/api/reviewer/queue/r1');
  });

  it('shows the five contact fields', async () => {
    await load();
    for (const value of [
      'Somchai',
      'Jaidee',
      '081 234 5678',
      'somchai@example.go.th',
      'Regional Office 1',
    ]) {
      expect(text()).toContain(value);
    }
    expect(el.querySelector('dl')?.textContent).toContain(
      m.requester_workplace(),
    );
  });

  it('shows the ask in human terms: group name, inclusive dates, area name', async () => {
    await load();
    expect(text()).toContain('โรคซิลิโคสิส');
    expect(text()).toContain('เชียงใหม่');
    const dates = [...el.querySelectorAll('time')].map((t) =>
      t.getAttribute('datetime'),
    );
    expect(dates).toContain('2025-01-01');
    expect(dates).toContain('2025-01-31');
  });

  it('names a whole health region and lists its provinces', async () => {
    await load({
      area: {
        kind: 'provinces',
        region: 1,
        provinces: [
          { id: '50', name: 'เชียงใหม่' },
          { id: '51', name: 'ลำพูน' },
        ],
      },
    });
    expect(text()).toContain(m.requester_area_region_selected({ region: 1 }));
    expect(text()).toContain('ลำพูน');
  });

  it('says the whole country for a national Request', async () => {
    await load({ area: { kind: 'national' } });
    expect(text()).toContain(m.requester_area_national());
  });

  it('holds the Report codes beneath the group name, collapsed', async () => {
    await load();
    const details = el.querySelector('details')!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain(
      m.reviewer_dossier_codes_disclosure({ count: 2 }),
    );
    expect(details.textContent).toContain('202');
    expect(details.textContent).toContain('203');
    // Beneath the name, never the headline.
    const heading = el.querySelector('h2, h3')!;
    expect(heading.textContent).not.toContain('202');
  });

  it('shows submit time and time remaining, and how many are ahead', async () => {
    await load();
    const sent = el.querySelector('time[datetime="2026-09-21T02:00:00.000Z"]');
    expect(sent).not.toBeNull();
    expect(text()).toContain('21 h 05 m');
    expect(text()).toContain(m.reviewer_dossier_ahead({ count: 3 }));
  });

  it('phrases none and one ahead as sentences', async () => {
    await load({ ahead: 0 });
    expect(text()).toContain(m.reviewer_dossier_ahead_none());
  });

  it('shows the count as pending, with a note, while the Probe has not landed', async () => {
    await load({ rowCount: 'pending' });
    expect(text()).toContain(m.reviewer_probe_label());
    expect(text()).toContain(m.reviewer_probe_pending());
    expect(text()).toContain(m.reviewer_probe_note());
  });

  it('shows the count as failed, with a different note, when the Probe was abandoned', async () => {
    await load({ rowCount: 'failed' });
    expect(text()).toContain(m.reviewer_probe_failed());
    expect(text()).toContain(m.reviewer_probe_failed_note());
    expect(text()).not.toContain(m.reviewer_probe_note());
  });

  it('shows the summed count as a number once the Probe has landed', async () => {
    await load({ rowCount: 129 });
    expect(text()).toContain('129');
    expect(text()).toContain(m.reviewer_probe_note());
  });

  it('shows a Request past the threshold as not actionable', async () => {
    await load({ expired: true, minutesLeft: 0, ahead: null });
    expect(text()).toContain(m.reviewer_dossier_expired());
    expect(text()).toContain(m.reviewer_clock_expired());
    expect(text()).not.toContain('requests are ahead');
  });

  it('offers no decision, no drain estimate and no history in this slice', async () => {
    await load();
    expect(el.querySelector('button')).toBeNull();
    expect(text()).not.toMatch(/~\s*\d+\s*min|will start|estimate/i);
  });

  it('moves focus to the heading once the Request is on screen', async () => {
    await load();
    expect(document.activeElement).toBe(el.querySelector('h2'));
  });

  it('says so when the Request is no longer awaiting review', async () => {
    http
      .expectOne('/api/reviewer/queue/r1')
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(text()).toContain(m.reviewer_dossier_gone());
  });

  it('says so when it cannot be loaded, and offers no stale contact details', async () => {
    http
      .expectOne('/api/reviewer/queue/r1')
      .flush('', { status: 500, statusText: 'Error' });
    await settle();
    expect(text()).toContain(m.reviewer_dossier_load_failed());
    expect(text()).not.toContain('081');
  });

  it('loads the next Request when the route changes, and drops the last one', async () => {
    await load();
    params.next(paramMap('r2'));
    await settle();
    http.expectOne('/api/reviewer/queue/r2');
    expect(text()).not.toContain('Somchai');
  });
});
