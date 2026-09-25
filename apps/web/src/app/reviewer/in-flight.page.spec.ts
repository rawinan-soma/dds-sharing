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
import { InFlightPage } from './in-flight.page';
import { type InFlightDetail } from './queue-api';
import { QueueStore } from './queue-store';

const ready = (over: Partial<InFlightDetail> = {}): InFlightDetail => ({
  requestId: 'r1',
  reference: 'REQ-2569-0001',
  submittedAt: '2026-09-20T02:00:00.000Z',
  requesterName: 'Somchai Jaidee',
  diseaseGroupName: 'โรคซิลิโคสิส',
  extraction: 'ready',
  linkExpiresAt: new Date(Date.now() + 30 * 60 * 60_000).toISOString(),
  actions: { rerun: true, resend: true },
  contact: {
    name: 'Somchai',
    surname: 'Jaidee',
    tel: '081 234 5678',
    email: 'somchai@example.go.th',
    workplace: 'Regional Office 1',
  },
  reportCodes: ['202'],
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  area: { kind: 'national' },
  approvedBy: 'Alice Reviewer',
  approvedAt: '2026-09-20T03:00:00.000Z',
  file: {
    archiveFilename: 'dds-envocc-sharing-20260920-090000.zip',
    attempts: 2,
  },
  ...over,
});

const extracting = () =>
  ready({
    extraction: 'extracting',
    actions: { rerun: false, resend: false },
    linkExpiresAt: null,
    file: null,
  });
const failed = () =>
  ready({
    extraction: 'failed',
    actions: { rerun: true, resend: false },
    linkExpiresAt: null,
    file: null,
  });

describe('InFlightPage', () => {
  let fixture: ComponentFixture<InFlightPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [InFlightPage],
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
    fixture = TestBed.createComponent(InFlightPage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function load(detail: InFlightDetail) {
    http.expectOne('/api/reviewer/in-flight/r1').flush(detail);
    await settle();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ');
  const resendButton = () =>
    el.querySelector<HTMLButtonElement>('button.resend')!;
  const rerunButton = () =>
    el.querySelector<HTMLButtonElement>('button.rerun')!;
  const reasonFor = (button: HTMLButtonElement) =>
    el.querySelector(`#${button.getAttribute('aria-describedby')}`)
      ?.textContent;

  it('shows the five live contact fields while the Request is in flight', async () => {
    await load(ready());
    for (const value of [
      'Somchai',
      'Jaidee',
      '081 234 5678',
      'somchai@example.go.th',
      'Regional Office 1',
    ]) {
      expect(text()).toContain(value);
    }
    expect(text()).toContain(m.reviewer_contact_visible_note());
  });

  it('names the approving Reviewer on the decision line', async () => {
    await load(ready());
    expect(text()).toContain(
      m.reviewer_approved_by({ reviewer: 'Alice Reviewer' }),
    );
  });

  it('shows the file, the time left on its link and the downloads, never the link', async () => {
    await load(ready());
    expect(text()).toContain('dds-envocc-sharing-20260920-090000.zip');
    expect(text()).toContain(m.reviewer_file_expires_in());
    expect(text()).toContain(m.reviewer_file_attempts_value({ count: 2 }));
    expect(el.querySelector('a[href*="/d/"]')).toBeNull();
  });

  it('offers Re-run and resend on a ready Extract', async () => {
    await load(ready());
    expect(resendButton().getAttribute('aria-disabled')).toBeNull();
    expect(rerunButton().getAttribute('aria-disabled')).toBeNull();
    expect(text()).toContain(m.reviewer_resend_note());
    expect(text()).toContain(m.reviewer_rerun_note());
  });

  it('holds both while extracting, focusable, saying why', async () => {
    await load(extracting());
    for (const button of [resendButton(), rerunButton()]) {
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(reasonFor(button)).toContain(
        m.reviewer_inflight_extracting_note(),
      );
      button.click();
    }
    await settle();
    http.expectNone(() => true);
    expect(text()).toContain(m.reviewer_state_extracting());
  });

  it('offers only Re-run on a failed extraction, saying why resend is held', async () => {
    await load(failed());
    expect(resendButton().getAttribute('aria-disabled')).toBe('true');
    expect(reasonFor(resendButton())).toContain(
      m.reviewer_inflight_failed_note(),
    );
    expect(rerunButton().getAttribute('aria-disabled')).toBeNull();
  });

  it('states that there is no way to correct the email address, and has no field for one', async () => {
    await load(ready());
    expect(text()).toContain(m.reviewer_no_email_edit_heading());
    expect(text()).toContain(m.reviewer_no_email_edit_detail());
    expect(
      el.querySelector('input, textarea, select, [contenteditable]'),
    ).toBeNull();
  });

  it('resends with an empty body, in its loading form while it goes', async () => {
    await load(ready());
    resendButton().click();
    await settle();
    expect(resendButton().textContent!.trim()).toBe(
      m.reviewer_resend_loading(),
    );
    expect(resendButton().getAttribute('aria-busy')).toBe('true');
    const req = http.expectOne('/api/reviewer/requests/r1/resend');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ sentAt: '2026-09-21T03:00:00.000Z' });
    await settle();
    expect(text()).toContain(m.reviewer_resend_sent());
  });

  it('says so when the sent email is no longer held', async () => {
    await load(ready());
    resendButton().click();
    http
      .expectOne('/api/reviewer/requests/r1/resend')
      .flush(
        { error: 'resend_unavailable' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    expect(text()).toContain(m.reviewer_resend_unavailable());
  });

  it('starts a Re-run, then reads as extracting with both actions held', async () => {
    const store = TestBed.inject(QueueStore);
    store.inFlight.set([ready()]);
    await load(ready());
    rerunButton().click();
    await settle();
    expect(rerunButton().textContent!.trim()).toBe(m.reviewer_rerun_loading());
    const req = http.expectOne('/api/reviewer/requests/r1/rerun');
    expect(req.request.body).toEqual({});
    req.flush({ queuedAt: '2026-09-21T03:00:00.000Z' });
    await settle();

    expect(text()).toContain(m.reviewer_rerun_started());
    expect(rerunButton().getAttribute('aria-disabled')).toBe('true');
    expect(resendButton().getAttribute('aria-disabled')).toBe('true');
    expect(store.inFlight()![0].extraction).toBe('extracting');
  });

  it('says a refused resend means nothing has been sent yet, not that it is extracting', async () => {
    await load(ready());
    resendButton().click();
    http
      .expectOne('/api/reviewer/requests/r1/resend')
      .flush(
        { error: 'nothing_to_resend' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    expect(text()).toContain(m.reviewer_resend_not_possible());
    expect(text()).not.toContain(m.reviewer_inflight_extracting_note());
  });

  it('drops the row from the list when a press finds the Request gone', async () => {
    const store = TestBed.inject(QueueStore);
    store.inFlight.set([ready(), ready({ requestId: 'r2' })]);
    await load(ready());
    rerunButton().click();
    http
      .expectOne('/api/reviewer/requests/r1/rerun')
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(text()).toContain(m.reviewer_inflight_gone());
    expect(store.inFlight()!.map((r) => r.requestId)).toEqual(['r2']);
  });

  it('says so when the Request is no longer in flight', async () => {
    http
      .expectOne('/api/reviewer/in-flight/r1')
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(text()).toContain(m.reviewer_inflight_gone());
    expect(text()).not.toContain('081 234 5678');
  });
});
