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
import { ReviewerSession } from './reviewer-session';

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
    const who = el.querySelector('section[aria-labelledby=who]')!;
    expect(who.querySelector('dl')?.textContent).toContain(
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

  it('heads the dossier with the reference over the requester’s full name', async () => {
    await load();
    const heading = el.querySelector('h2')!;
    expect(heading.textContent).toContain('Somchai Jaidee');
    expect(el.querySelector('.reference')!.textContent).toContain(
      'REQ-2569-0001',
    );
  });

  it('names a whole health region and counts its provinces, without chips', async () => {
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
    expect(text()).toContain(m.reviewer_area_province_count({ count: 2 }));
    expect(el.querySelector('.chip')).toBeNull();
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
    expect(text()).toContain(m.reviewer_dossier_ahead_label());
    expect(text()).toContain(m.reviewer_dossier_ahead_count({ count: 3 }));
  });

  it('says none are ahead in a word', async () => {
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
    await load({ rowCount: 1284 });
    expect(text()).toContain(m.reviewer_probe_rows({ count: '1,284' }));
    expect(text()).toContain(m.reviewer_probe_note());
  });

  it('says a count of zero means no reports match, and still offers approve', async () => {
    await load({ rowCount: 0 });
    expect(text()).toContain(m.reviewer_probe_zero());
    expect(
      [...el.querySelectorAll('button')].some(
        (b) => b.textContent!.trim() === m.reviewer_approve(),
      ),
    ).toBe(true);
  });

  it('shows a Request past the threshold as not actionable', async () => {
    await load({ expired: true, minutesLeft: 0, ahead: null });
    expect(text()).toContain(m.reviewer_dossier_expired());
    expect(text()).toContain(m.reviewer_clock_expired());
    expect(text()).not.toContain('requests are ahead');
  });

  it('offers no drain estimate and no history', async () => {
    await load();
    expect(text()).not.toMatch(/~\s*\d+\s*min|will start|estimate/i);
  });

  it('offers no decision for a Request already past the threshold', async () => {
    await load({ expired: true, minutesLeft: 0, ahead: null });
    expect(el.querySelector('button')).toBeNull();
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

  describe('the Decision (§10.3)', () => {
    const buttonNamed = (name: string) =>
      [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === name,
      )!;
    const approveButton = () => buttonNamed(m.reviewer_approve());
    const rejectButton = () => buttonNamed(m.reviewer_reject());
    const confirmButton = () =>
      buttonNamed(m.reviewer_approve_confirm_submit());
    const rejectSubmitButton = () => buttonNamed(m.reviewer_reject_submit());

    const dialog = () => el.querySelector<HTMLElement>('[role=dialog]');
    const after = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('sits below the identity fields and the ask, in the DOM as well as on screen', async () => {
      await load();
      const who = el.querySelector('section[aria-labelledby=who]')!;
      const ask = el.querySelector('section[aria-labelledby=ask]')!;
      expect(after(who, approveButton())).toBe(true);
      expect(after(ask, approveButton())).toBe(true);
      expect(after(ask, rejectButton())).toBe(true);
    });

    it('confirms in a modal dialog naming the requester, with the confirm focused', async () => {
      await load();
      approveButton().click();
      await settle();
      const d = dialog()!;
      expect(d.getAttribute('aria-modal')).toBe('true');
      const title = el.querySelector(`#${d.getAttribute('aria-labelledby')}`)!;
      expect(title.textContent).toContain(
        m.reviewer_approve_dialog_title({ name: 'Somchai Jaidee' }),
      );
      expect(d.textContent).toContain('REQ-2569-0001');
      expect(d.textContent).toContain('Regional Office 1');
      expect(document.activeElement).toBe(confirmButton());
    });

    it('never names the Reviewer in the confirm or while it is approving', async () => {
      const session = TestBed.inject(ReviewerSession);
      vi.spyOn(session, 'current').mockReturnValue({
        displayName: 'Alice Reviewer',
        mustChangePassword: false,
        expiresAt: '2026-09-21T09:00:00.000Z',
      } as ReturnType<ReviewerSession['current']>);
      await load();
      approveButton().click();
      await settle();
      expect(dialog()!.textContent).not.toContain('Alice Reviewer');

      confirmButton().click();
      await settle();
      const loading = buttonNamed(m.reviewer_approve_loading());
      expect(loading.getAttribute('aria-busy')).toBe('true');
      expect(dialog()!.textContent).not.toContain('Alice Reviewer');
      // An approval that has gone cannot come back.
      expect(buttonNamed(m.reviewer_cancel()).disabled).toBe(true);
      http.expectOne('/api/reviewer/queue/r1/approve');
    });

    it('closes on Escape and returns focus to the button that opened it', async () => {
      await load();
      approveButton().focus();
      approveButton().click();
      await settle();
      dialog()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await settle();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(approveButton());
      http.expectNone(() => true);
    });

    it('states plainly what was recorded once approved, without asking again', async () => {
      await load();
      approveButton().click();
      fixture.detectChanges();

      confirmButton().click();
      http
        .expectOne({ url: '/api/reviewer/queue/r1/approve', method: 'POST' })
        .flush({ outcome: 'approved', decidedAt: '2026-09-21T07:32:00.000Z' });
      await settle();

      expect(el.querySelector('button')).toBeNull();
      expect(dialog()).toBeNull();
      expect(text()).toContain(m.reviewer_decided_approved_detail());
      // A link to the in-flight tab, the dossier staying where it is (11c).
      expect(
        el.querySelector('a[href="/reviewer/r1?zone=in-flight"]')?.textContent,
      ).toContain(m.reviewer_decided_approved_link());
      // Never auto-advances: the same Request stays on screen (§10.3).
      expect(text()).toContain('REQ-2569-0001');
    });

    it('requires a note of at least 10 characters before reject can be submitted', async () => {
      await load();
      rejectButton().click();
      await settle();
      const textarea0 = el.querySelector('textarea')!;
      expect(document.activeElement).toBe(textarea0);
      // The hint saying why the confirm is held, and that the note is never sent.
      expect(
        el.querySelector(`#${textarea0.getAttribute('aria-describedby')}`)
          ?.textContent,
      ).toContain(m.reviewer_reject_note_hint());
      expect(text()).toContain(m.reviewer_reject_no_autosave());
      expect(rejectSubmitButton().disabled).toBe(true);

      const textarea = el.querySelector('textarea')!;
      textarea.value = 'too short';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(rejectSubmitButton().disabled).toBe(true);

      textarea.value = 'Could not verify the workplace.';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(rejectSubmitButton().disabled).toBe(false);
    });

    it('sends the note and states that no reason was sent to the requester', async () => {
      await load();
      rejectButton().click();
      fixture.detectChanges();
      const textarea = el.querySelector('textarea')!;
      textarea.value = 'Could not verify the workplace by phone.';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      rejectSubmitButton().click();
      const req = http.expectOne({
        url: '/api/reviewer/queue/r1/reject',
        method: 'POST',
      });
      expect(req.request.body).toEqual({
        note: 'Could not verify the workplace by phone.',
      });
      req.flush({ outcome: 'rejected', decidedAt: '2026-09-21T07:32:00.000Z' });
      await settle();

      expect(el.querySelector('button')).toBeNull();
      expect(text()).toContain(m.reviewer_decided_rejected_detail());
      expect(text()).toContain(m.reviewer_decided_rejected_note());
    });

    it('lets the Reviewer cancel an approve confirm without submitting', async () => {
      await load();
      approveButton().click();
      fixture.detectChanges();
      const cancel = buttonNamed(m.reviewer_cancel());
      cancel.click();
      fixture.detectChanges();
      http.expectNone(() => true);
      expect(approveButton()).not.toBeNull();
    });

    it('shows a refusal, not a Decision, when the Request expired while it was open', async () => {
      await load();
      approveButton().click();
      fixture.detectChanges();
      confirmButton().click();
      http
        .expectOne({ url: '/api/reviewer/queue/r1/approve', method: 'POST' })
        .flush({ error: 'expired' }, { status: 409, statusText: 'Conflict' });
      await settle();

      expect(el.querySelector('button')).toBeNull();
      expect(text()).toContain(m.reviewer_decision_expired_heading());
      // The header's clock and the queue row both read expired (11e).
      expect(el.querySelector('.head-cells')!.textContent).toContain(
        m.reviewer_clock_expired(),
      );
    });

    it('never carries a half-typed note across Requests', async () => {
      await load();
      rejectButton().click();
      fixture.detectChanges();
      const textarea = el.querySelector('textarea')!;
      textarea.value = 'A note nobody should see again.';
      textarea.dispatchEvent(new Event('input'));

      params.next(paramMap('r2'));
      await settle();
      http.expectOne('/api/reviewer/queue/r2').flush(dossier({ id: 'r2' }));
      await settle();

      expect(el.querySelector('textarea')).toBeNull();
      expect(text()).not.toContain('A note nobody should see again');
    });

    it('offers no decision once the Request has already expired', async () => {
      await load({ expired: true, minutesLeft: 0, ahead: null });
      expect(el.querySelector('button')).toBeNull();
    });
  });
});
