import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { SignInPage } from './sign-in.page';

describe('SignInPage', () => {
  let fixture: ComponentFixture<SignInPage>;
  let http: HttpTestingController;
  let router: Router;
  let el: HTMLElement;

  async function setup(returnTo: string | null = null) {
    TestBed.configureTestingModule({
      imports: [SignInPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(returnTo ? { returnTo } : {}),
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SignInPage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const input = (id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;

  /**
   * Fills the form and submits it, answers the page's first call (the session
   * check that also hands it a CSRF token) and returns the sign-in request the
   * page then makes.
   */
  async function submitAndGetSignIn(
    values = {
      username: 'somchai',
      password: 'Pw-1234567890!',
      code: '123456',
    },
  ) {
    for (const [id, value] of Object.entries(values)) {
      input(id).value = value;
      input(id).dispatchEvent(new Event('input'));
    }
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const check = await vi.waitFor(() =>
      http.expectOne('/api/reviewer/session'),
    );
    check.flush({ authenticated: false });
    return vi.waitFor(() => http.expectOne('/api/reviewer/sign-in'));
  }

  const signedIn = (mustChangePassword: boolean) => ({
    displayName: 'S',
    expiresAt: new Date(Date.now() + 3.6e6).toISOString(),
    mustChangePassword,
  });

  it('shows username, password and the code on one form, with the catalogue copy', async () => {
    await setup();
    expect(el.querySelectorAll('form')).toHaveLength(1);
    expect(el.querySelector('label[for=username]')?.textContent).toBe(
      m.reviewer_signin_username(),
    );
    expect(el.querySelector('label[for=password]')?.textContent).toBe(
      m.reviewer_signin_password(),
    );
    expect(el.querySelector('label[for=code]')?.textContent).toBe(
      m.reviewer_signin_code(),
    );
    expect(el.querySelector('button[type=submit]')?.textContent?.trim()).toBe(
      m.reviewer_signin_submit(),
    );
    expect(input('password').type).toBe('password');
  });

  it('shows the notes beneath: audit, recovery through the other Reviewer, and unlisted as tidiness', async () => {
    await setup();
    const text = el.textContent!;
    expect(text).toContain(m.reviewer_signin_audit_note());
    expect(text).toContain(m.reviewer_signin_recovery_detail());
    expect(text).toContain(m.reviewer_signin_unlisted_note());
  });

  it('submits all three together in a single request', async () => {
    await setup();
    const req = await submitAndGetSignIn();
    expect(req.request.body).toEqual({
      username: 'somchai',
      password: 'Pw-1234567890!',
      code: '123456',
    });
    req.flush(signedIn(false));
    await vi.waitFor(() => expect(router.navigateByUrl).toHaveBeenCalled());
  });

  it('gives one generic failure, whichever factor was wrong, and says there is no lockout', async () => {
    await setup();
    const req = await submitAndGetSignIn();
    req.flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')).not.toBeNull(),
    );

    const alert = el.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain(m.reviewer_signin_failed());
    expect(alert.textContent).toContain(m.reviewer_signin_no_lockout());
    // Nothing on screen names a factor as the culprit.
    expect(alert.textContent).not.toMatch(/(only|just) the (password|code)/i);
  });

  it('moves focus to the failure message', async () => {
    await setup();
    const req = await submitAndGetSignIn();
    req.flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(el.querySelector('[role=alert]')),
    );
  });

  it('empties the code box after a try, because a code is single use', async () => {
    await setup();
    const req = await submitAndGetSignIn();
    req.flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
    await vi.waitFor(() => expect(input('code').value).toBe(''));
    expect(input('username').value).toBe('somchai');
  });

  it('tells a throttled Reviewer how long to wait', async () => {
    await setup();
    const req = await submitAndGetSignIn();
    req.flush(
      { error: 'throttled', retryAfterSeconds: 16 },
      { status: 429, statusText: 'x' },
    );
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')?.textContent).toContain(
        m.reviewer_signin_throttled({ seconds: 16 }),
      ),
    );
  });

  it('returns to the address the Reviewer came from after signing in', async () => {
    await setup('/reviewer/request/REQ-2569-0142');
    const req = await submitAndGetSignIn();
    req.flush(signedIn(false));
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith(
        '/reviewer/request/REQ-2569-0142',
      ),
    );
  });

  it('will not follow a return-to that leaves the Reviewer surface', async () => {
    await setup('https://evil.example/reviewer');
    const req = await submitAndGetSignIn();
    req.flush(signedIn(false));
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith('/reviewer'),
    );
  });

  it('sends a Reviewer who owes a password change to the gate, keeping the return-to', async () => {
    await setup('/reviewer/request/REQ-1');
    const req = await submitAndGetSignIn();
    req.flush(signedIn(true));
    await vi.waitFor(() =>
      expect(router.navigate).toHaveBeenCalledWith(['/reviewer/password'], {
        queryParams: { returnTo: '/reviewer/request/REQ-1' },
      }),
    );
  });
});
