import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { ReviewerSignIn } from './sign-in';
import { ReviewerApiService } from '../reviewer-api.service';

describe('ReviewerSignIn (spec §17.5: one form, one generic failure)', () => {
  function setup(apiOverrides: Partial<ReviewerApiService> = {}) {
    const api = {
      signIn: vi.fn(),
      signOut: vi.fn(),
      ...apiOverrides,
    };
    TestBed.configureTestingModule({
      imports: [ReviewerSignIn],
      providers: [{ provide: ReviewerApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(ReviewerSignIn);
    return { fixture, api };
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
});
