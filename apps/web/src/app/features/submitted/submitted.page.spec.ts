import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter } from '@angular/router';
import { routes } from '../../app.routes.js';
import { SubmittedPage } from './submitted.page.js';
import type {
  DuplicateRequestResponse,
  SubmitRequestResponse,
} from '../../requests-api/requests-api.types.js';

function withNavigationState(state: unknown) {
  return { provide: Location, useValue: { getState: () => state } };
}

describe('SubmittedPage', () => {
  const acknowledged: { kind: 'acknowledged' } & SubmitRequestResponse = {
    kind: 'acknowledged',
    referenceNumber: 'REQ-2569-0142',
    diseaseGroupNameTh: 'โรคซิลิโคสิส',
    from: '2026-01-01',
    to: '2026-01-31',
    days: 31,
    area: { kind: 'national' },
    servicePromiseBusinessHours: 24,
  };

  const duplicate: { kind: 'duplicate' } & DuplicateRequestResponse = {
    kind: 'duplicate',
    code: 'request_in_progress',
    existingReferenceNumber: 'REQ-2569-0099',
    existingState: 'pending',
    existingSubmittedAt: '2026-01-01T00:00:00.000Z',
  };

  it('reads the confirmation from navigation state, not the URL — the route carries no reference number', async () => {
    const submittedRoute = routes.find((r) => r.path === 'submitted');
    expect(submittedRoute).toBeDefined();
    expect(submittedRoute?.path).not.toContain(':');

    await TestBed.configureTestingModule({
      imports: [SubmittedPage],
      providers: [provideRouter([]), withNavigationState(acknowledged)],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('REQ-2569-0142');
  });

  it('renders the reference number, restatement, service promise and telephone on an acknowledged submit', async () => {
    await TestBed.configureTestingModule({
      imports: [SubmittedPage],
      providers: [provideRouter([]), withNavigationState(acknowledged)],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('REQ-2569-0142');
    expect(compiled.textContent).toContain('โรคซิลิโคสิส');
    expect(compiled.textContent).toContain('24');
  });

  it('renders the existing reference number on a duplicate outcome, not the acknowledged panel', async () => {
    await TestBed.configureTestingModule({
      imports: [SubmittedPage],
      providers: [provideRouter([]), withNavigationState(duplicate)],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('REQ-2569-0099');
    expect(compiled.textContent).not.toContain('REQ-2569-0142');
  });

  it('falls back to a bare confirmation with no reference data when navigation state is lost', async () => {
    await TestBed.configureTestingModule({
      imports: [SubmittedPage],
      providers: [provideRouter([]), withNavigationState(undefined)],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).not.toContain('REQ-');
  });
});
