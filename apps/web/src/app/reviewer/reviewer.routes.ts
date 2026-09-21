import { inject } from '@angular/core';
import { type CanActivateFn, type Routes, Router } from '@angular/router';
import { PasswordGatePage } from './password-gate.page';
import { signInQueryFor } from './return-to';
import { ReviewerShell } from './reviewer-shell';
import { ReviewerSession } from './reviewer-session';
import { SignInPage } from './sign-in.page';
import { SignedInPage } from './signed-in.page';

/**
 * Everything behind sign-in. A Reviewer who still owes the forced password
 * change sees the gate instead of anything else, until it is made.
 */
export const requireSession: CanActivateFn = async (_route, state) => {
  const session = inject(ReviewerSession);
  const router = inject(Router);
  await session.ensureReady();

  const held = session.current();
  if (!held) {
    return router.createUrlTree(['/reviewer/sign-in'], {
      queryParams: signInQueryFor(state.url),
    });
  }
  if (held.mustChangePassword) {
    return router.createUrlTree(['/reviewer/password'], {
      queryParams: signInQueryFor(state.url),
    });
  }
  return true;
};

/** The password gate itself: only for a Reviewer who owes the change. */
export const requirePendingChange: CanActivateFn = async (route, state) => {
  const session = inject(ReviewerSession);
  const router = inject(Router);
  await session.ensureReady();

  const held = session.current();
  if (!held) {
    return router.createUrlTree(['/reviewer/sign-in'], {
      queryParams: signInQueryFor(state.url),
    });
  }
  if (!held.mustChangePassword) {
    return router.createUrlTree(['/reviewer'], {
      queryParams: signInQueryFor(route.queryParamMap.get('returnTo') ?? ''),
    });
  }
  return true;
};

// Mounted at /reviewer by the app's routes.
export const reviewerRoutes: Routes = [
  {
    path: '',
    component: ReviewerShell,
    children: [
      { path: 'sign-in', component: SignInPage },
      {
        path: 'password',
        component: PasswordGatePage,
        canActivate: [requirePendingChange],
      },
      { path: '', component: SignedInPage, canActivate: [requireSession] },
      { path: '**', redirectTo: '' },
    ],
  },
];
