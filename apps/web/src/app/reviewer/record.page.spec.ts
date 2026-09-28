import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  type ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import * as m from '../../paraglide/messages.js';
import { type RequestRecord } from './queue-api';
import { RecordPage } from './record.page';

const REFERENCE = 'REQ-2569-0142';

const collected = (over: Partial<RequestRecord> = {}): RequestRecord => ({
  requestId: 'r9',
  reference: REFERENCE,
  state: 'collected',
  submittedAt: '2026-09-21T02:00:00.000Z',
  diseaseGroupName: 'โรคซิลิโคสิส',
  reportCodes: ['202', '203'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  area: { kind: 'national' },
  decision: {
    outcome: 'approved',
    reviewer: 'Alice Reviewer',
    decidedAt: '2026-09-21T02:30:00.000Z',
    workplace: 'Snapshot Office',
    rowCount: 129,
  },
  files: [
    {
      run: 2,
      archiveFilename: 'dds-envocc-sharing-20260921-090000-r2.zip',
      link: 'live',
      expiresAt: new Date(Date.now() + (30 * 60 + 5) * 60_000).toISOString(),
      attempts: 2,
    },
    {
      run: 1,
      archiveFilename: 'dds-envocc-sharing-20260921-090000.zip',
      link: 'revoked',
      expiresAt: '2026-09-24T02:00:00.000Z',
      attempts: 0,
    },
  ],
  events: [
    {
      type: 'download_attempted',
      occurredAt: '2026-09-22T04:00:00.000Z',
      actor: 'anonymous',
      reviewer: null,
    },
    {
      type: 'approved',
      occurredAt: '2026-09-21T02:30:00.000Z',
      actor: 'reviewer',
      reviewer: 'Alice Reviewer',
    },
    {
      type: 'submitted',
      occurredAt: '2026-09-21T02:00:00.000Z',
      actor: 'requester',
      reviewer: null,
    },
  ],
  ...over,
});

// A terminal Request, opened from a lookup (spec §10.10, handoff screen 13):
// the record, read-only, and never the contact fields.
describe('RecordPage', () => {
  let fixture: ComponentFixture<RecordPage>;
  let http: HttpTestingController;
  let router: Router;
  let el: HTMLElement;

  async function open(carried: RequestRecord | null = null) {
    history.replaceState(carried ? { record: carried } : null, '');
    TestBed.configureTestingModule({
      imports: [RecordPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject<ParamMap>(
              convertToParamMap({ reference: REFERENCE }),
            ),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(RecordPage);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  }

  afterEach(() => {
    http.verify();
    history.replaceState(null, '');
  });

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const expectLookup = () =>
    http.expectOne(
      (req) =>
        req.url === '/api/reviewer/lookup' &&
        req.params.get('reference') === REFERENCE,
    );

  async function fetched(body: object | null, status = 200) {
    await open();
    expectLookup().flush(body, {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
    });
    await settle();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ');
  const rowsOf = (selector: string) =>
    [...el.querySelectorAll(`${selector} tbody tr`)].map((tr) =>
      [...tr.querySelectorAll('td, th')].map((cell) =>
        cell.textContent!.replace(/\s+/g, ' ').trim(),
      ),
    );

  it('opens the record the search carried, without reading it again', async () => {
    await open(collected());
    http.expectNone('/api/reviewer/lookup');
    expect(text()).toContain(REFERENCE);
  });

  it('reads the record by its reference when nothing was carried', async () => {
    await fetched({ zone: null, record: collected() });
    expect(text()).toContain(REFERENCE);
  });

  it('sends a Request that is back on the surface to its zone instead', async () => {
    await fetched({ zone: 'alerts', requestId: 'r9' });
    expect(router.navigate).toHaveBeenCalledWith(
      ['/reviewer', 'alerts', 'r9'],
      {
        replaceUrl: true,
      },
    );
  });

  it('says when no Request has the reference', async () => {
    await fetched({ error: 'not_found' }, 404);
    expect(text()).toContain(m.reviewer_lookup_not_found());
  });

  it('says when it could not be read', async () => {
    await fetched(null, 500);
    expect(text()).toContain(m.reviewer_lookup_load_failed());
  });

  it('heads the record with its state, in words, and says it is read-only', async () => {
    await open(collected());
    const heading = el.querySelector('h2')!;
    expect(heading.textContent).toContain(REFERENCE);
    expect(text()).toContain(m.reviewer_state_collected());
    expect(text()).toContain(m.reviewer_lookup_readonly());
    expect(text()).toContain(m.reviewer_lookup_ended_title());
    expect(text()).toContain(m.reviewer_lookup_ended_detail());
  });

  it('moves focus to the heading, as selecting any Request does', async () => {
    await open(collected());
    expect(document.activeElement).toBe(el.querySelector('h2'));
  });

  it('carries no action of any kind', async () => {
    await open(collected());
    expect(el.querySelectorAll('button, form, input, textarea')).toHaveLength(
      0,
    );
  });

  it('shows the ask, and the Decision beside it with its Reviewer and the Snapshot', async () => {
    await open(collected());
    for (const value of [
      'โรคซิลิโคสิส',
      '202, 203',
      m.requester_area_national(),
      m.reviewer_approved_by({ reviewer: 'Alice Reviewer' }),
      'Snapshot Office',
      '129',
    ]) {
      expect(text()).toContain(value);
    }
  });

  it('never shows a contact field label: the only workplace is the Snapshot’s', async () => {
    await open(collected());
    expect(text()).not.toContain(m.reviewer_dossier_telephone());
    expect(text()).not.toContain(m.reviewer_dossier_email());
    expect(text()).not.toContain(m.reviewer_contact_visible_note());
  });

  it('names the Reviewer who refused a rejected Request', async () => {
    await open(
      collected({
        state: 'rejected',
        decision: { ...collected().decision!, outcome: 'rejected' },
        files: [],
      }),
    );
    expect(text()).toContain(m.reviewer_state_rejected());
    expect(text()).toContain(
      m.reviewer_rejected_by({ reviewer: 'Alice Reviewer' }),
    );
    expect(text()).toContain(m.reviewer_lookup_no_files());
  });

  it('says no Decision was made for a Request that expired undecided', async () => {
    await open(collected({ state: 'expired', decision: null, files: [] }));
    expect(text()).toContain(m.reviewer_clock_expired());
    expect(text()).toContain(m.reviewer_lookup_no_decision());
  });

  it('reads a count still pending at the Decision as not yet counted', async () => {
    await open(
      collected({
        decision: { ...collected().decision!, rowCount: 'pending' },
      }),
    );
    expect(text()).toContain(m.reviewer_lookup_probe_uncounted());
  });

  it('tables every file: its run, its name, its link and its downloads', async () => {
    await open(collected());
    const [live, revoked] = rowsOf('.files');
    expect(live[0]).toBe('2');
    expect(live[1]).toBe('dds-envocc-sharing-20260921-090000-r2.zip');
    expect(live[2]).toMatch(/30 /);
    expect(live[3]).toBe(m.reviewer_file_attempts_value({ count: 2 }));
    expect(revoked[2]).toBe(m.reviewer_lookup_link_revoked());
  });

  it.each([
    ['expired', () => m.reviewer_lookup_link_expired()],
    ['used_up', () => m.reviewer_lookup_link_used_up()],
  ] as const)('reads a %s link in words', async (link, words) => {
    await open(collected({ files: [{ ...collected().files[0], link }] }));
    expect(rowsOf('.files')[0][2]).toBe(words());
  });

  it('lists the event trail newest first, each with who did it', async () => {
    await open(collected());
    const trail = rowsOf('.events');
    expect(trail.map((row) => row[1])).toEqual([
      m.reviewer_event_download_attempted(),
      m.reviewer_event_approved(),
      m.reviewer_event_submitted(),
    ]);
    expect(trail.map((row) => row[2])).toEqual([
      m.reviewer_actor_anonymous(),
      'Alice Reviewer',
      m.reviewer_actor_requester(),
    ]);
    expect(text()).toContain(m.reviewer_lookup_events_note());
  });

  it('pairs every time with its machine-readable instant', async () => {
    await open(collected());
    const times = [...el.querySelectorAll('.events time')].map((t) =>
      t.getAttribute('datetime'),
    );
    expect(times).toEqual(collected().events.map((e) => e.occurredAt));
  });
});
