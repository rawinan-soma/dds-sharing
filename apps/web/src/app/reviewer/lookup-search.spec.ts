import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { LookupSearch } from './lookup-search';
import { type RequestRecord } from './queue-api';

const record: RequestRecord = {
  requestId: 'r9',
  reference: 'REQ-2569-0142',
  state: 'collected',
  submittedAt: '2026-09-21T02:00:00.000Z',
  diseaseGroupName: 'โรคซิลิโคสิส',
  reportCodes: ['202'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  area: { kind: 'national' },
  decision: null,
  files: [],
  events: [],
};

// The search field in the sidebar header (spec §10.10, handoff screen 13):
// exact reference only, and where it finds the Request decides where it opens.
describe('LookupSearch', () => {
  let fixture: ComponentFixture<LookupSearch>;
  let http: HttpTestingController;
  let router: Router;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LookupSearch],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(LookupSearch);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const input = () => el.querySelector<HTMLInputElement>('input')!;
  const button = () => el.querySelector<HTMLButtonElement>('button')!;
  const text = () => el.textContent!.replace(/\s+/g, ' ');

  async function search(value: string) {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  const expectLookup = (reference: string) =>
    http.expectOne(
      (req) =>
        req.url === '/api/reviewer/lookup' &&
        req.params.get('reference') === reference,
    );

  it('is a labelled field that says it reaches finished requests too', () => {
    const label = el.querySelector(`label[for="${input().id}"]`);
    expect(label?.textContent).toContain(m.reviewer_lookup_label());
    expect(text()).toContain(m.reviewer_lookup_hint());
    expect(button().textContent).toContain(m.reviewer_lookup_submit());
  });

  it('asks by the reference and nothing else, and says it is finding', async () => {
    await search('REQ-2569-0142');
    const req = expectLookup('REQ-2569-0142');
    expect([...req.request.params.keys()]).toEqual(['reference']);
    expect(button().textContent).toContain(m.reviewer_lookup_loading());
    expect(button().getAttribute('aria-busy')).toBe('true');
    req.flush({ zone: 'queue', requestId: 'r1' });
    await settle();
    expect(button().textContent).toContain(m.reviewer_lookup_submit());
  });

  it('sends nothing for an empty field', async () => {
    await search('   ');
    http.expectNone('/api/reviewer/lookup');
  });

  it.each([
    ['queue', ['/reviewer', 'r1']],
    ['alerts', ['/reviewer', 'alerts', 'r1']],
    ['in_flight', ['/reviewer', 'in-flight', 'r1']],
  ])(
    'opens a Request still on the surface in its zone: %s',
    async (zone, path) => {
      await search('REQ-2569-0142');
      expectLookup('REQ-2569-0142').flush({ zone, requestId: 'r1' });
      await settle();
      expect(router.navigate).toHaveBeenCalledWith(path);
    },
  );

  it('opens a terminal Request as a record, carrying what was found', async () => {
    await search('REQ-2569-0142');
    expectLookup('REQ-2569-0142').flush({ zone: null, record });
    await settle();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/reviewer', 'lookup', 'REQ-2569-0142'],
      { state: { record } },
    );
  });

  it('says plainly when no Request has that reference', async () => {
    await search('REQ-2569-9999');
    expectLookup('REQ-2569-9999').flush(
      { error: 'not_found' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    expect(text()).toContain(m.reviewer_lookup_not_found());
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('says so when the search itself failed, which is not the same as nothing found', async () => {
    await search('REQ-2569-0142');
    expectLookup('REQ-2569-0142').flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();
    expect(text()).toContain(m.reviewer_lookup_failed());
    expect(text()).not.toContain(m.reviewer_lookup_not_found());
  });
});
