import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { ReviewerSession } from './reviewer-session';
import { SessionToast } from './session-toast';

describe('SessionToast', () => {
  let fixture: ComponentFixture<SessionToast>;
  let session: ReviewerSession;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SessionToast],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    session = TestBed.inject(ReviewerSession);
    fixture = TestBed.createComponent(SessionToast);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('is absent until the warning is due', () => {
    expect(el.querySelector('aside')).toBeNull();
  });

  it('appears as an alert when the warning is raised', async () => {
    session.warning.set(true);
    await fixture.whenStable();
    const toast = el.querySelector('aside')!;
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.textContent).toContain(m.reviewer_session_warning_title());
    expect(toast.textContent).toContain(m.reviewer_session_warning_detail());
  });

  it('sits at the bottom left, and is neither a modal nor a banner', async () => {
    session.warning.set(true);
    await fixture.whenStable();
    const toast = el.querySelector('aside')!;
    const style = getComputedStyle(toast);
    expect(style.position).toBe('fixed');
    expect(style.left).not.toBe('');
    expect(style.bottom).not.toBe('');
    expect(style.top).toBe('');
    expect(style.right).toBe('');
    // Not a dialog, and nothing covers the page behind it.
    expect(toast.getAttribute('aria-modal')).toBeNull();
    expect(
      el.querySelector('[role=dialog], [role=alertdialog], dialog, .backdrop'),
    ).toBeNull();
  });

  it('can be dismissed without ending the session', async () => {
    session.warning.set(true);
    await fixture.whenStable();
    const dismiss = [...el.querySelectorAll('button')].find(
      (b) => b.textContent!.trim() === m.reviewer_session_warning_dismiss(),
    )!;
    dismiss.click();
    await fixture.whenStable();
    expect(el.querySelector('aside')).toBeNull();
  });

  it('offers to sign in again now', async () => {
    const again = vi.spyOn(session, 'signInAgain').mockResolvedValue();
    session.warning.set(true);
    await fixture.whenStable();
    const resume = [...el.querySelectorAll('button')].find(
      (b) => b.textContent!.trim() === m.reviewer_session_warning_resume(),
    )!;
    resume.click();
    expect(again).toHaveBeenCalledOnce();
  });
});
