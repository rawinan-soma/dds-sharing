import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ReviewerSession } from './reviewer-session';

// The server turns a call away with a 401 once the Reviewer's session is gone,
// whether the idle hour or the ceiling ended it. Any such refusal on the
// Reviewer API sends the page to sign-in with a return-to address. The calls
// that are *about* credentials answer 401 for a wrong password, and are not
// this.
const CREDENTIAL_CALLS = /^\/api\/reviewer\/(sign-in|password|session)(\?|$)/;
const SESSION_ENDED = new Set(['session_expired', 'unauthenticated']);

export const reviewerSessionInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(ReviewerSession);
  return next(req).pipe(
    tap({
      error: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          req.url.startsWith('/api/reviewer/') &&
          !CREDENTIAL_CALLS.test(req.url) &&
          SESSION_ENDED.has(
            (error.error as { error?: string } | null)?.error ?? '',
          )
        ) {
          session.endedByServer();
        }
      },
    }),
  );
};
