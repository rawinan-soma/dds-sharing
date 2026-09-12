import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'reviewer',
    // Not linked from anywhere in the public app (spec §17.4) — reached only by bookmark.
    loadComponent: () => import('./reviewer/sign-in/sign-in').then((m) => m.ReviewerSignIn),
  },
];
