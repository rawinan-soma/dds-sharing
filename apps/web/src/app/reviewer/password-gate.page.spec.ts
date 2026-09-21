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
import { PasswordGatePage } from './password-gate.page';

describe('PasswordGatePage', () => {
  let fixture: ComponentFixture<PasswordGatePage>;
  let http: HttpTestingController;
  let router: Router;
  let el: HTMLElement;

  async function setup(returnTo: string | null = null) {
    TestBed.configureTestingModule({
      imports: [PasswordGatePage],
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
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PasswordGatePage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const input = (id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;

  function submit(
    values = {
      'current-password': 'Temp-Pass-1234!',
      'new-password': 'Brand-New-Pass-42!',
      'change-code': '654321',
    },
  ) {
    for (const [id, value] of Object.entries(values)) {
      input(id).value = value;
      input(id).dispatchEvent(new Event('input'));
    }
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('shows the one-time notice of what is recorded, and that it is permanent', async () => {
    await setup();
    const text = el.textContent!;
    for (const line of [
      m.reviewer_retention_heading(),
      m.reviewer_retention_signins(),
      m.reviewer_retention_response_times(),
      m.reviewer_retention_alerts(),
      m.reviewer_retention_display_name(),
      m.reviewer_retention_permanent(),
    ]) {
      expect(text).toContain(line);
    }
  });

  it('asks for the current password, a new one and a fresh code, with the rules stated', async () => {
    await setup();
    expect(el.querySelector('label[for=current-password]')?.textContent).toBe(
      m.reviewer_password_current(),
    );
    expect(el.querySelector('label[for=new-password]')?.textContent).toBe(
      m.reviewer_password_new(),
    );
    expect(el.textContent).toContain(m.reviewer_password_rules());
    expect(el.textContent).toContain(m.reviewer_first_login_fresh_code());
  });

  it('submits current password, new password and code, then moves past the gate', async () => {
    await setup('/reviewer/request/REQ-1');
    submit();
    const req = await vi.waitFor(() =>
      http.expectOne('/api/reviewer/password'),
    );
    expect(req.request.body).toEqual({
      currentPassword: 'Temp-Pass-1234!',
      newPassword: 'Brand-New-Pass-42!',
      code: '654321',
    });
    req.flush(null, { status: 204, statusText: 'x' });
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith(
        '/reviewer/request/REQ-1',
      ),
    );
  });

  it('lists each specific policy violation, not a generic error', async () => {
    await setup();
    submit({
      'current-password': 'x',
      'new-password': 'short',
      'change-code': '111111',
    });
    const req = await vi.waitFor(() =>
      http.expectOne('/api/reviewer/password'),
    );
    req.flush(
      {
        error: 'password_policy',
        violations: ['too_short', 'no_uppercase', 'no_digit'],
      },
      { status: 422, statusText: 'x' },
    );
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')).not.toBeNull(),
    );
    const alert = el.querySelector('[role=alert]')!.textContent!;
    expect(alert).toContain(m.reviewer_password_violation_too_short());
    expect(alert).toContain(m.reviewer_password_violation_no_uppercase());
    expect(alert).toContain(m.reviewer_password_violation_no_digit());
    expect(alert).not.toContain(m.reviewer_password_failed());
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('fails a wrong current password or a stale code with one generic message', async () => {
    await setup();
    submit();
    const req = await vi.waitFor(() =>
      http.expectOne('/api/reviewer/password'),
    );
    req.flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')?.textContent).toContain(
        m.reviewer_password_failed(),
      ),
    );
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('says how long to wait when throttled', async () => {
    await setup();
    submit();
    const req = await vi.waitFor(() =>
      http.expectOne('/api/reviewer/password'),
    );
    req.flush(
      { error: 'throttled', retryAfterSeconds: 8 },
      { status: 429, statusText: 'x' },
    );
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')?.textContent).toContain(
        m.reviewer_signin_throttled({ seconds: 8 }),
      ),
    );
  });

  it('empties the code box after a try', async () => {
    await setup();
    submit();
    const req = await vi.waitFor(() =>
      http.expectOne('/api/reviewer/password'),
    );
    req.flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
    await vi.waitFor(() => expect(input('change-code').value).toBe(''));
  });
});
