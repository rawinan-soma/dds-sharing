import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ReviewerSession, SESSION_WARNING_MS } from './reviewer-session';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('ReviewerSession', () => {
  let session: ReviewerSession;
  let http: HttpTestingController;
  let router: Router;
  const T0 = Date.UTC(2026, 8, 21, 2, 0, 0);

  const info = (overrides: object = {}) => ({
    displayName: 'Somchai Jaidee',
    expiresAt: new Date(T0 + 6 * HOUR).toISOString(),
    mustChangePassword: false,
    ...overrides,
  });

  async function signInWith(overrides: object = {}) {
    const pending = session.signIn('somchai', 'pw', '123456');
    http.expectOne('/api/reviewer/sign-in').flush(info(overrides));
    return pending;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    session = TestBed.inject(ReviewerSession);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('signing in', () => {
    it('holds the session the server returned', async () => {
      const outcome = await signInWith();
      expect(outcome.kind).toBe('ok');
      expect(session.current()?.displayName).toBe('Somchai Jaidee');
      expect(session.current()?.mustChangePassword).toBe(false);
    });

    it('sends the username, password and code together in one request', async () => {
      const pending = session.signIn('somchai', 'Secret-1!Secret', '654321');
      const req = http.expectOne('/api/reviewer/sign-in');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        username: 'somchai',
        password: 'Secret-1!Secret',
        code: '654321',
      });
      req.flush(info());
      await pending;
      http.verify();
    });

    it('reports one failure however the server says it failed', async () => {
      const pending = session.signIn('somchai', 'pw', '000000');
      http
        .expectOne('/api/reviewer/sign-in')
        .flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
      expect(await pending).toEqual({ kind: 'failed' });
      expect(session.current()).toBeNull();
    });

    it('carries how long to wait when throttled', async () => {
      const pending = session.signIn('somchai', 'pw', '000000');
      http
        .expectOne('/api/reviewer/sign-in')
        .flush(
          { error: 'throttled', retryAfterSeconds: 8 },
          { status: 429, statusText: 'x' },
        );
      expect(await pending).toEqual({
        kind: 'throttled',
        retryAfterSeconds: 8,
      });
    });

    it('reports the service unreachable rather than a wrong credential', async () => {
      const pending = session.signIn('somchai', 'pw', '000000');
      http
        .expectOne('/api/reviewer/sign-in')
        .error(new ProgressEvent('error'), { status: 0 });
      expect(await pending).toEqual({ kind: 'unavailable' });
    });
  });

  describe('the session ceiling', () => {
    it('shows the warning five minutes before the ceiling, and not before', async () => {
      await signInWith();

      await vi.advanceTimersByTimeAsync(6 * HOUR - SESSION_WARNING_MS - 1000);
      expect(session.warning()).toBe(false);

      await vi.advanceTimersByTimeAsync(1500);
      expect(session.warning()).toBe(true);
      expect(SESSION_WARNING_MS).toBe(5 * MIN);
    });

    it('returns the Reviewer to sign-in when the ceiling is reached, with a return-to address', async () => {
      await signInWith();
      vi.spyOn(router, 'url', 'get').mockReturnValue('/reviewer/request/REQ-1');

      await vi.advanceTimersByTimeAsync(6 * HOUR + 1000);
      // The server is asked, so it records the expiry it now finds.
      http
        .match('/api/reviewer/session')
        .forEach((r) => r.flush({ authenticated: false, expired: true }));

      expect(session.current()).toBeNull();
      expect(session.warning()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/reviewer/sign-in'], {
        queryParams: { returnTo: '/reviewer/request/REQ-1' },
      });
    });

    it('does nothing on idle time alone: only the absolute ceiling drives it', async () => {
      await signInWith();
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(session.warning()).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(session.current()).not.toBeNull();
    });

    it('shows the warning at once when a reload finds it already inside the last five minutes', async () => {
      const pending = session.refresh();
      http.expectOne('/api/reviewer/session').flush({
        authenticated: true,
        ...info({ expiresAt: new Date(T0 + 3 * MIN).toISOString() }),
      });
      await pending;
      expect(session.warning()).toBe(true);
    });

    it('can dismiss the warning without touching the session', async () => {
      await signInWith();
      await vi.advanceTimersByTimeAsync(6 * HOUR - 4 * MIN);
      expect(session.warning()).toBe(true);
      session.dismissWarning();
      expect(session.warning()).toBe(false);
      expect(session.current()).not.toBeNull();
      // Still ends at the ceiling.
      await vi.advanceTimersByTimeAsync(5 * MIN);
      expect(session.current()).toBeNull();
    });

    it('stops watching once the Reviewer signs out', async () => {
      await signInWith();
      const pending = session.signOut();
      http
        .expectOne('/api/reviewer/sign-out')
        .flush(null, { status: 204, statusText: 'x' });
      await pending;

      await vi.advanceTimersByTimeAsync(7 * HOUR);
      expect(session.warning()).toBe(false);
      // Signing out is the Reviewer's own act: no return-to, straight to sign-in.
      expect(router.navigate).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/reviewer/sign-in']);
    });
  });

  describe('signing in again from the warning', () => {
    it('ends the session and returns to sign-in with the current screen as the return-to', async () => {
      await signInWith();
      vi.spyOn(router, 'url', 'get').mockReturnValue('/reviewer/request/REQ-9');
      const pending = session.signInAgain();
      http
        .expectOne('/api/reviewer/sign-out')
        .flush(null, { status: 204, statusText: 'x' });
      await pending;
      expect(session.current()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/reviewer/sign-in'], {
        queryParams: { returnTo: '/reviewer/request/REQ-9' },
      });
    });
  });

  describe('a session the server has ended', () => {
    it('sends the Reviewer to sign-in when a call is refused as expired', async () => {
      await signInWith();
      vi.spyOn(router, 'url', 'get').mockReturnValue('/reviewer/queue');
      session.endedByServer();
      expect(session.current()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/reviewer/sign-in'], {
        queryParams: { returnTo: '/reviewer/queue' },
      });
    });
  });

  describe('reloading the page', () => {
    it('restores a live session', async () => {
      const pending = session.refresh();
      http
        .expectOne('/api/reviewer/session')
        .flush({ authenticated: true, ...info({ mustChangePassword: true }) });
      await pending;
      expect(session.current()?.mustChangePassword).toBe(true);
    });

    it('holds no session when there is none', async () => {
      const pending = session.refresh();
      http.expectOne('/api/reviewer/session').flush({ authenticated: false });
      await pending;
      expect(session.current()).toBeNull();
      expect(session.ready()).toBe(true);
    });
  });

  describe('changing the password', () => {
    it('clears the forced-change flag on success', async () => {
      await signInWith({ mustChangePassword: true });
      const pending = session.changePassword('old', 'new', '111111');
      const req = http.expectOne('/api/reviewer/password');
      expect(req.request.body).toEqual({
        currentPassword: 'old',
        newPassword: 'new',
        code: '111111',
      });
      req.flush(null, { status: 204, statusText: 'x' });
      expect(await pending).toEqual({ kind: 'ok' });
      expect(session.current()?.mustChangePassword).toBe(false);
    });

    it('surfaces the specific policy violations and keeps the gate', async () => {
      await signInWith({ mustChangePassword: true });
      const pending = session.changePassword('old', 'short', '111111');
      http
        .expectOne('/api/reviewer/password')
        .flush(
          { error: 'password_policy', violations: ['too_short', 'no_digit'] },
          { status: 422, statusText: 'x' },
        );
      expect(await pending).toEqual({
        kind: 'policy',
        violations: ['too_short', 'no_digit'],
      });
      expect(session.current()?.mustChangePassword).toBe(true);
    });

    it('fails a wrong current password or stale code as generically as sign-in', async () => {
      await signInWith({ mustChangePassword: true });
      const pending = session.changePassword(
        'wrong',
        'Brand-New-Pass-42!',
        '000000',
      );
      http
        .expectOne('/api/reviewer/password')
        .flush({ error: 'sign_in_failed' }, { status: 401, statusText: 'x' });
      expect(await pending).toEqual({ kind: 'failed' });
      expect(session.current()?.mustChangePassword).toBe(true);
    });

    it('reports a throttle with the wait', async () => {
      await signInWith({ mustChangePassword: true });
      const pending = session.changePassword(
        'old',
        'Brand-New-Pass-42!',
        '000000',
      );
      http
        .expectOne('/api/reviewer/password')
        .flush(
          { error: 'throttled', retryAfterSeconds: 4 },
          { status: 429, statusText: 'x' },
        );
      expect(await pending).toEqual({
        kind: 'throttled',
        retryAfterSeconds: 4,
      });
    });
  });
});
