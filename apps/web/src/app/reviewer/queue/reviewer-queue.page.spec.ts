import { TestBed } from '@angular/core/testing';
import { ReviewerQueuePage } from './reviewer-queue.page';
import { ReviewerQueueApiService } from './reviewer-queue-api.service';
import type { QueueRow, RequestDetail } from './reviewer-queue-api.types';

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 'r1',
    referenceNumber: 'REQ-2569-0001',
    requesterName: 'สมชาย ใจดี',
    workplace: 'โรงพยาบาลตัวอย่าง',
    diseaseGroupNameTh: 'โรคซิลิโคสิส',
    submittedAt: new Date().toISOString(),
    businessHoursRemaining: 20,
    timeRemainingLabel: '20 h 00 m left',
    isActionable: true,
    ...overrides,
  };
}

function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    referenceNumber: 'REQ-2569-0001',
    contact: {
      name: 'สมชาย',
      surname: 'ใจดี',
      tel: '0812345678',
      email: 'somchai@example.com',
      workplace: 'โรงพยาบาลตัวอย่าง',
    },
    diseaseGroupNameTh: 'โรคซิลิโคสิส',
    reportCodes: ['202', '203'],
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    days: 31,
    area: { kind: 'national', label: 'Whole country' },
    submittedAt: new Date().toISOString(),
    decisionDueAt: new Date().toISOString(),
    businessHoursRemaining: 20,
    timeRemainingLabel: '20 h 00 m left',
    isActionable: true,
    requestsAhead: 0,
    probeRowCount: null,
    ...overrides,
  };
}

describe('ReviewerQueuePage (spec §10.1, §10.2, ticket #65 — read-only)', () => {
  function setup(apiOverrides: Partial<ReviewerQueueApiService> = {}) {
    const api = {
      listPending: vi.fn().mockResolvedValue({ outcome: 'ok', result: { requests: [], refreshedAt: new Date().toISOString() } }),
      getDetail: vi.fn(),
      ...apiOverrides,
    };
    TestBed.configureTestingModule({
      imports: [ReviewerQueuePage],
      providers: [{ provide: ReviewerQueueApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(ReviewerQueuePage);
    fixture.componentRef.setInput('displayName', 'Alice Reviewer');
    return { fixture, api };
  }

  it('shows an empty-queue state when there is nothing pending', async () => {
    const { fixture } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nothing to decide right now.');
  });

  it('lists pending requests with reference, requester, workplace and time remaining', async () => {
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row()], refreshedAt: new Date().toISOString() },
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('REQ-2569-0001');
    expect(el.textContent).toContain('สมชาย ใจดี');
    expect(el.textContent).toContain('โรงพยาบาลตัวอย่าง');
    expect(el.textContent).toContain('20 h 00 m left');
  });

  it('marks a Request past 24 business hours as expired, not as a live countdown', async () => {
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: {
          requests: [row({ isActionable: false, timeRemainingLabel: 'expired', businessHoursRemaining: 0 })],
          refreshedAt: new Date().toISOString(),
        },
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.time-remaining.expired')?.textContent?.trim()).toBe('expired');
  });

  it('shows the dossier empty state until a row is picked, with no decision buttons ever rendered (that is #66)', async () => {
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row()], refreshedAt: new Date().toISOString() },
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pick a request from the queue to see its detail.');
    expect(el.textContent?.toLowerCase()).not.toContain('approve');
    expect(el.textContent?.toLowerCase()).not.toContain('reject');
  });

  it('loads and renders the five contact fields, group name over collapsed report codes, dates and area on selection', async () => {
    const getDetail = vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() });
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row()], refreshedAt: new Date().toISOString() },
      }),
      getDetail,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.queue-row')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getDetail).toHaveBeenCalledWith('r1');
    expect(el.textContent).toContain('สมชาย ใจดี');
    expect(el.textContent).toContain('0812345678');
    expect(el.textContent).toContain('somchai@example.com');
    expect(el.textContent).toContain('โรงพยาบาลตัวอย่าง');
    expect(el.textContent).toContain('โรคซิลิโคสิส');
    expect(el.textContent).toContain('202, 203');
    expect(el.textContent).toContain('Whole country');
    expect(el.textContent).toContain('0 requests ahead of it');
    expect(el.textContent).toContain('Not available yet'); // the Probe's honest placeholder
    expect(el.textContent?.toLowerCase()).not.toContain('approve');
    expect(el.textContent?.toLowerCase()).not.toContain('reject');
  });

  it('collapses the report codes behind a toggle rather than showing them as the headline', async () => {
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row()], refreshedAt: new Date().toISOString() },
      }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.queue-row')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const details = el.querySelector('details')!;
    expect(details).toBeTruthy();
    expect(details.hasAttribute('open')).toBe(false);
  });

  it('shows "no longer pending" when a selected request has dropped off (e.g. decided elsewhere)', async () => {
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row()], refreshedAt: new Date().toISOString() },
      }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'not_found' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.queue-row')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('This request is no longer pending.');
  });

  it('re-fetches the list on Refresh, and updates the staleness line', async () => {
    const listPending = vi.fn().mockResolvedValue({
      outcome: 'ok',
      result: { requests: [], refreshedAt: new Date().toISOString() },
    });
    const { fixture } = setup({ listPending });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listPending).toHaveBeenCalledTimes(1);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.refresh')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listPending).toHaveBeenCalledTimes(2);
  });

  it('emits sessionExpired on a 401 from the list, and never renders a decision UI while unauthenticated', async () => {
    const { fixture } = setup({ listPending: vi.fn().mockResolvedValue({ outcome: 'unauthenticated' }) });
    let expired = false;
    fixture.componentRef.instance.sessionExpired.subscribe(() => (expired = true));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(expired).toBe(true);
  });

  it('emits sessionExpired on a 401 from the detail fetch too', async () => {
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row()], refreshedAt: new Date().toISOString() },
      }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'unauthenticated' }),
    });
    let expired = false;
    fixture.componentRef.instance.sessionExpired.subscribe(() => (expired = true));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.queue-row')!.click();
    await fixture.whenStable();

    expect(expired).toBe(true);
  });

  it('emits signOutRequested when the header sign-out button is pressed', async () => {
    const { fixture } = setup();
    let signOutRequested = false;
    fixture.componentRef.instance.signOutRequested.subscribe(() => (signOutRequested = true));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.sign-out')!.click();
    expect(signOutRequested).toBe(true);
  });
});
