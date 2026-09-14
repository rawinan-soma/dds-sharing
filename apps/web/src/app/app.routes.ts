import { Routes } from '@angular/router';
import { RequestFormPage } from './features/request-form/request-form.page.js';
import { SubmittedPage } from './features/submitted/submitted.page.js';

export const routes: Routes = [
  { path: '', component: RequestFormPage },
  { path: 'submitted', component: SubmittedPage },
  {
    path: 'reviewer',
    // Not linked from anywhere in the public app (spec §17.4) — reached only by bookmark.
    loadComponent: () => import('./reviewer/sign-in/sign-in').then((m) => m.ReviewerSignIn),
  },
  // Must stay last — a wildcard ahead of 'reviewer' would swallow it.
  { path: '**', redirectTo: '' },
];
