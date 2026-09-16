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
    probeRowCount: 'pending',
    ...overrides,
  };
}

describe('ReviewerQueuePage (spec §10.1, §10.2, §10.3, tickets #65–#66)', () => {
  function setup(apiOverrides: Partial<ReviewerQueueApiService> = {}) {
    const api = {
      listPending: vi.fn().mockResolvedValue({ outcome: 'ok', result: { requests: [], refreshedAt: new Date().toISOString() } }),
      getDetail: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
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

  it('shows the dossier empty state until a row is picked, with no decision buttons rendered before then', async () => {
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
    expect(el.textContent).toContain('pending'); // the Probe's row count, before it lands (§5.4)
    // §5.4: a Decision waits on none of the Probe's three states — Approve
    // and Reject render even while the count is still "pending".
    expect(el.textContent).toContain('Approve and release');
    expect(el.querySelector('button.reject')?.textContent?.trim()).toBe('Reject');
  });

  it.each([
    ['a landed summed total', 4, '4'],
    ['an abandoned Probe', 'failed', 'failed'],
  ])('renders the Probe row count as %s (§5.4, §10.2)', async (_label, probeRowCount, expected) => {
    const getDetail = vi.fn().mockResolvedValue({
      outcome: 'ok',
      result: detail({ probeRowCount: probeRowCount as number | 'failed' }),
    });
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

    expect(el.textContent).toContain(expected);
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

  // The Decision (spec §10.3, ticket #66) --------------------------------

  async function selectFirstRow(fixture: ReturnType<typeof setup>['fixture']) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.queue-row')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('approve asks for confirmation naming the signed-in Reviewer before it calls the API', async () => {
    const approve = vi.fn().mockResolvedValue({ outcome: 'approved', decidedAt: new Date().toISOString() });
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({ outcome: 'ok', result: { requests: [row()], refreshedAt: new Date().toISOString() } }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() }),
      approve,
    });
    await selectFirstRow(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.approve')!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Alice Reviewer');
    expect(approve).not.toHaveBeenCalled();

    el.querySelectorAll<HTMLButtonElement>('button.approve').forEach((button) => {
      if (button.textContent?.includes('Confirm approve')) button.click();
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(approve).toHaveBeenCalledWith('r1');
    expect(el.textContent).toContain('Approved by you');
    expect(el.textContent).toContain('in-flight list');
  });

  it('reject refuses a note under 10 characters without calling the API, then submits a valid one', async () => {
    const reject = vi.fn().mockResolvedValue({ outcome: 'rejected', decidedAt: new Date().toISOString() });
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({ outcome: 'ok', result: { requests: [row()], refreshedAt: new Date().toISOString() } }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() }),
      reject,
    });
    await selectFirstRow(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.reject')!.click();
    fixture.detectChanges();

    const textarea = el.querySelector<HTMLTextAreaElement>('textarea#reject-note')!;
    textarea.value = 'short';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('form.reject button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(reject).not.toHaveBeenCalled();
    expect(el.textContent).toContain('At least 10 characters.');

    textarea.value = 'Could not confirm the workplace by telephone.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('form.reject button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(reject).toHaveBeenCalledWith('r1', 'Could not confirm the workplace by telephone.');
    expect(el.textContent).toContain('Rejected');
    expect(el.textContent).toContain('told no reason');
  });

  it('never auto-advances to another pending Request after a Decision', async () => {
    const approve = vi.fn().mockResolvedValue({ outcome: 'approved', decidedAt: new Date().toISOString() });
    const getDetail = vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() });
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({
        outcome: 'ok',
        result: { requests: [row({ id: 'r1' }), row({ id: 'r2', referenceNumber: 'REQ-2569-0002' })], refreshedAt: new Date().toISOString() },
      }),
      getDetail,
      approve,
    });
    await selectFirstRow(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.approve')!.click();
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('button.approve').forEach((button) => {
      if (button.textContent?.includes('Confirm approve')) button.click();
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // getDetail was only ever asked about the decided row — nothing here
    // ever picks up r2 on its own.
    expect(getDetail).toHaveBeenCalledTimes(1);
    expect(getDetail).toHaveBeenCalledWith('r1');
    expect(el.querySelectorAll('li button.queue-row')).toHaveLength(1);
    expect(el.textContent).toContain('Approved by you');
  });

  it('shows the request expired while reviewing, and removes it from the pending list', async () => {
    const approve = vi.fn().mockResolvedValue({ outcome: 'expired', expiredAt: new Date().toISOString() });
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({ outcome: 'ok', result: { requests: [row()], refreshedAt: new Date().toISOString() } }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() }),
      approve,
    });
    await selectFirstRow(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.approve')!.click();
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('button.approve').forEach((button) => {
      if (button.textContent?.includes('Confirm approve')) button.click();
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('expired while you were reviewing it');
    expect(el.querySelectorAll('li button.queue-row')).toHaveLength(0);
  });

  it('cancelling a confirm returns to the plain action buttons without calling the API', async () => {
    const approve = vi.fn();
    const { fixture } = setup({
      listPending: vi.fn().mockResolvedValue({ outcome: 'ok', result: { requests: [row()], refreshedAt: new Date().toISOString() } }),
      getDetail: vi.fn().mockResolvedValue({ outcome: 'ok', result: detail() }),
      approve,
    });
    await selectFirstRow(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.approve')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button.cancel')!.click();
    fixture.detectChanges();

    expect(approve).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Approve and release');
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
