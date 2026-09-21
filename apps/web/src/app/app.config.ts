import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideHttpClient,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { reviewerSessionInterceptor } from './reviewer/session-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // The double-submit token on every state-changing /reviewer call (§10.5).
    provideHttpClient(
      withInterceptors([reviewerSessionInterceptor]),
      withXsrfConfiguration({
        cookieName: 'reviewer_csrf',
        headerName: 'X-CSRF-Token',
      }),
    ),
  ],
};
