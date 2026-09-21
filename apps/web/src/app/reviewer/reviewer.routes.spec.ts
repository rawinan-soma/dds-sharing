import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  Router,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { ReviewerSession } from './reviewer-session';
import { requirePendingChange, requireSession } from './reviewer.routes';

describe('reviewer route guards', () => {
  let router: Router;
  let session: ReviewerSession;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    router = TestBed.inject(Router);
    session = TestBed.inject(ReviewerSession);
    session.ready.set(true);
  });

  const at = (url: string) => ({ url }) as RouterStateSnapshot;
  const route = (returnTo?: string) =>
    ({
      queryParamMap: convertToParamMap(returnTo ? { returnTo } : {}),
    }) as unknown as ActivatedRouteSnapshot;
  const run = (
    guard: typeof requireSession,
    r: ActivatedRouteSnapshot,
    url: string,
  ) =>
    TestBed.runInInjectionContext(() => guard(r, at(url))) as Promise<
      boolean | UrlTree
    >;
  const hold = (mustChangePassword: boolean) =>
    (session as unknown as { session: { set(v: unknown): void } }).session.set({
      displayName: 'S',
      expiresAt: new Date(Date.now() + 3.6e6).toISOString(),
      mustChangePassword,
    });

  it('sends a visitor with no session to sign-in, remembering where they were going', async () => {
    const result = (await run(
      requireSession,
      route(),
      '/reviewer/request/REQ-1',
    )) as UrlTree;
    expect(router.serializeUrl(result)).toBe(
      '/reviewer/sign-in?returnTo=%2Freviewer%2Frequest%2FREQ-1',
    );
  });

  it('shows the password gate instead of the signed-in view while a change is owed', async () => {
    hold(true);
    const result = (await run(requireSession, route(), '/reviewer')) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/reviewer/password');
  });

  it('lets a Reviewer with nothing owed through', async () => {
    hold(false);
    expect(await run(requireSession, route(), '/reviewer')).toBe(true);
  });

  it('admits only a Reviewer who owes the change to the gate itself', async () => {
    hold(true);
    expect(await run(requirePendingChange, route(), '/reviewer/password')).toBe(
      true,
    );
  });

  it('turns a Reviewer who owes nothing away from the gate, back to where they were going', async () => {
    hold(false);
    const result = (await run(
      requirePendingChange,
      route('/reviewer/request/REQ-1'),
      '/reviewer/password',
    )) as UrlTree;
    expect(router.serializeUrl(result)).toBe(
      '/reviewer?returnTo=%2Freviewer%2Frequest%2FREQ-1',
    );
  });

  it('sends a visitor with no session away from the gate too', async () => {
    const result = (await run(
      requirePendingChange,
      route(),
      '/reviewer/password',
    )) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/reviewer/sign-in');
  });
});
