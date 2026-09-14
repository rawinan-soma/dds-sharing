import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { ReviewerSignIn } from './sign-in';
import { ReviewerApiService } from '../reviewer-api.service';
import { SessionCeilingService } from '../session-ceiling.service';

describe('ReviewerSignIn (spec §17.5: one form, one generic failure)', () => {
  function setup(apiOverrides: Partial<ReviewerApiService> = {}, sessionCeilingOverrides: Partial<SessionCeilingService> = {}) {
    const api = {
      signIn: vi.fn(),
      signOut: vi.fn(),
      changePassword: vi.fn(),
      ...apiOverrides,
    };
    // Real timers are never advanced in most of these tests, so a stubbed
    // SessionCeilingService keeps them from depending on background timer
    // behaviour that belongs to its own spec file instead.
    const sessionCeiling = {
      warningVisible: signal(false),
      start: vi.fn(),
      stop: vi.fn(),
      ...sessionCeilingOverrides,
    };
    TestBed.configureTestingModule({
      imports: [ReviewerSignIn],
      providers: [
        provideRouter([]),
        { provide: ReviewerApiService, useValue: api },
        { provide: SessionCeilingService, useValue: sessionCeiling },
      ],
    });
    const fixture = TestBed.createComponent(ReviewerSignIn);
    return { fixture, api, sessionCeiling };
  }

  function fillAndSubmit(fixture: ReturnType<typeof setup>['fixture'], values: { username: string; password: string; totpCode: string }) {
    const el = fixture.nativeElement as HTMLElement;
    const setInput = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    setInput('input[formcontrolname="username"]', values.username);
    setInput('input[formcontrolname="password"]', values.password);
    setInput('input[formcontrolname="totpCode"]', values.totpCode);
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  function fillAndSubmitChangePasswordForm(
    fixture: ReturnType<typeof setup>['fixture'],
    values: { currentPassword: string; newPassword: string; totpCode: string },
  ) {
    const el = fixture.nativeElement as HTMLElement;
    const setInput = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    setInput('input[formcontrolname="currentPassword"]', values.currentPassword);
    setInput('input[formcontrolname="newPassword"]', values.newPassword);
    setInput('input[formcontrolname="totpCode"]', values.totpCode);
    fixture.detectChanges();
    el.querySelector('form.change-password')!.dispatchEvent(new Event('submit'));
  }

  it('renders username, password and authenticator code on one form', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[formcontrolname="username"]')).toBeTruthy();
    expect(el.querySelector('input[formcontrolname="password"]')).toBeTruthy();
    expect(el.querySelector('input[formcontrolname="totpCode"]')).toBeTruthy();
    expect(el.querySelectorAll('form')).toHaveLength(1);
  });

  it('adds a noindex meta tag while mounted, and removes it on destroy', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex');

    fixture.destroy();
    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('shows one generic message for invalid credentials, whichever factor was wrong', async () => {
    const { fixture, api } = setup({ signIn: vi.fn().mockResolvedValue({ outcome: 'invalid_credentials' }) });
    fixture.detectChanges();
    fillAndSubmit(fixture, { username: 'alice', password: 'wrong', totpCode: '123456' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.signIn).toHaveBeenCalledWith('alice', 'wrong', '123456');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain('Username, password or code is wrong.');
  });

  it('shows a distinct message when throttled', async () => {
    const { fixture } = setup({ signIn: vi.fn().mockResolvedValue({ outcome: 'throttled' }) });
    fixture.detectChanges();
    fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain('Too many attempts');
  });

  it('switches to the signed-in view on success, and can sign out back to the form', async () => {
    const { fixture, api } = setup({
      signIn: vi.fn().mockResolvedValue({
        outcome: 'success',
        result: { displayName: 'Alice Reviewer', mustChangePassword: false, absoluteExpiresAt: new Date().toISOString() },
      }),
      signOut: vi.fn().mockResolvedValue(undefined),
    });
    fixture.detectChanges();
    fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
    await fixture.whenStable();
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Welcome, Alice Reviewer.');

    el.querySelector<HTMLButtonElement>('button.secondary')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.signOut).toHaveBeenCalled();
    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[formcontrolname="username"]')).toBeTruthy();
  });

  it('starts the session-ceiling timer with the absolute expiry on a successful sign-in', async () => {
    const absoluteExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { fixture, sessionCeiling } = setup({
      signIn: vi.fn().mockResolvedValue({
        outcome: 'success',
        result: { displayName: 'Alice Reviewer', mustChangePassword: false, absoluteExpiresAt },
      }),
    });
    fixture.detectChanges();
    fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(sessionCeiling.start).toHaveBeenCalledWith(absoluteExpiresAt, expect.any(Function));
  });

  it('shows the non-blocking session-ceiling toast, bottom-left, when the warning fires', async () => {
    const warningVisible = signal(false);
    const { fixture } = setup(
      {
        signIn: vi.fn().mockResolvedValue({
          outcome: 'success',
          result: { displayName: 'Alice Reviewer', mustChangePassword: false, absoluteExpiresAt: new Date().toISOString() },
        }),
      },
      { warningVisible },
    );
    fixture.detectChanges();
    fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
    await fixture.whenStable();
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.session-toast')).toBeNull();

    warningVisible.set(true);
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    const toast = el.querySelector('.session-toast')!;
    expect(toast).toBeTruthy();
    expect(toast.textContent).toMatch(/session.*(expire|end)/i);
  });

  describe('the forced first-login password change (spec §17.5)', () => {
    function signInRequiringChange(overrides: Partial<Parameters<typeof setup>[0]> = {}) {
      return setup({
        signIn: vi.fn().mockResolvedValue({
          outcome: 'success',
          result: { displayName: 'Alice Reviewer', mustChangePassword: true, absoluteExpiresAt: new Date().toISOString() },
        }),
        ...overrides,
      });
    }

    it('shows the retention notice and a password-change form instead of the signed-in view', async () => {
      const { fixture } = signInRequiringChange();
      fixture.detectChanges();
      fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('Welcome, Alice Reviewer.');
      expect(el.querySelector('input[formcontrolname="currentPassword"]')).toBeTruthy();
      expect(el.querySelector('input[formcontrolname="newPassword"]')).toBeTruthy();
      expect(el.querySelector('form.change-password input[formcontrolname="totpCode"]')).toBeTruthy();
    });

    it('moves the reviewer past the gate once the password change succeeds', async () => {
      const { fixture, api } = signInRequiringChange({ changePassword: vi.fn().mockResolvedValue({ outcome: 'ok' }) });
      fixture.detectChanges();
      fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
      await fixture.whenStable();
      fixture.detectChanges();

      fillAndSubmitChangePasswordForm(fixture, {
        currentPassword: 'x',
        newPassword: 'Correct-Horse1!',
        totpCode: '654321',
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.changePassword).toHaveBeenCalledWith('x', 'Correct-Horse1!', '654321');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Welcome, Alice Reviewer.');
    });

    it('shows the specific policy violations for a non-compliant new password, not a generic error', async () => {
      const { fixture } = signInRequiringChange({
        changePassword: vi.fn().mockResolvedValue({ outcome: 'policy_violation', violations: ['too_short', 'missing_digit'] }),
      });
      fixture.detectChanges();
      fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
      await fixture.whenStable();
      fixture.detectChanges();

      fillAndSubmitChangePasswordForm(fixture, { currentPassword: 'x', newPassword: 'short', totpCode: '654321' });
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const text = el.querySelector('.change-password .error')?.textContent ?? '';
      expect(text).not.toContain('Username, password or code is wrong.');
      expect(text.toLowerCase()).toContain('character');
      expect(text.toLowerCase()).toContain('digit');
    });

    it('fails a wrong current password or stale code the same generic way sign-in does', async () => {
      const { fixture } = signInRequiringChange({
        changePassword: vi.fn().mockResolvedValue({ outcome: 'invalid_current_credentials' }),
      });
      fixture.detectChanges();
      fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
      await fixture.whenStable();
      fixture.detectChanges();

      fillAndSubmitChangePasswordForm(fixture, { currentPassword: 'wrong', newPassword: 'Correct-Horse1!', totpCode: '654321' });
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.change-password .error')?.textContent).toContain('Current password or code is wrong.');
    });

    it('throttles the same way sign-in does', async () => {
      const { fixture } = signInRequiringChange({
        changePassword: vi.fn().mockResolvedValue({ outcome: 'throttled' }),
      });
      fixture.detectChanges();
      fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
      await fixture.whenStable();
      fixture.detectChanges();

      fillAndSubmitChangePasswordForm(fixture, { currentPassword: 'x', newPassword: 'Correct-Horse1!', totpCode: '654321' });
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.change-password .error')?.textContent).toContain('Too many attempts');
    });
  });

  it('takes the reviewer to the sign-in form and navigates with a return-to address when the session ceiling is reached', async () => {
    const absoluteExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    let capturedOnExpire: (() => void) | undefined;
    const { fixture } = setup(
      {
        signIn: vi.fn().mockResolvedValue({
          outcome: 'success',
          result: { displayName: 'Alice Reviewer', mustChangePassword: false, absoluteExpiresAt },
        }),
      },
      {
        start: vi.fn((_absoluteExpiresAt: string, onExpire: () => void) => {
          capturedOnExpire = onExpire;
        }),
      },
    );
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    fillAndSubmit(fixture, { username: 'alice', password: 'x', totpCode: '123456' });
    await fixture.whenStable();
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Welcome, Alice Reviewer.');

    capturedOnExpire!();
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[formcontrolname="username"]')).toBeTruthy();
    expect(navigateSpy).toHaveBeenCalledWith(['/reviewer'], { queryParams: { returnTo: expect.any(String) } });
  });
});
