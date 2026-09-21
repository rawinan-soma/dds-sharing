import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '../../paraglide/messages.js';
import { routes } from '../app.routes';
import { SubmissionState } from './submission-state';
import { SubmittedPage } from './submitted-page.component';

describe('SubmittedPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('carries the reference number, the ask, the service promise and the telephone number', async () => {
    TestBed.inject(SubmissionState).current.set({
      reference: 'REQ-2569-0142',
      diseaseGroupName: 'โรคซิลิโคสิส',
      from: '2025-01-01',
      to: '2025-01-31',
      areaLabel: 'ทั้งประเทศ',
    });
    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('REQ-2569-0142');
    expect(text).toContain('โรคซิลิโคสิส');
    expect(text).toContain('ทั้งประเทศ');
    expect(text).toContain(m.requester_confirm_decision_detail());
    expect(text).toContain(m.app_telephone());
  });

  it('reads as done: nothing on it is styled or worded as an error', async () => {
    TestBed.inject(SubmissionState).current.set({
      reference: 'REQ-2569-0142',
      diseaseGroupName: 'x',
      from: '2025-01-01',
      to: '2025-01-31',
      areaLabel: 'x',
    });
    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(
      root.querySelector(
        '[role="alert"], .failed-rule, .summary, .failed-text',
      ),
    ).toBeNull();
    expect(root.querySelector('h1')!.textContent).toBe(
      m.requester_confirm_title(),
    );
  });

  it('does not restate the email address, and shows no row count', async () => {
    TestBed.inject(SubmissionState).current.set({
      reference: 'REQ-2569-0142',
      diseaseGroupName: 'x',
      from: '2025-01-01',
      to: '2025-01-31',
      areaLabel: 'x',
    });
    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/\brows?\b/i);
  });

  it('sends a Requester who arrives with nothing back to the form, since its address holds no reference', async () => {
    const fixture = TestBed.createComponent(SubmittedPage);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(TestBed.inject(Router).url).toBe('/');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-reference]'),
    ).toBeNull();
  });
});
