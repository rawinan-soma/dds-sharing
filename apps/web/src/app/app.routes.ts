import { Routes } from '@angular/router';

// The Reviewer surface is its own chunk: lazy loading keeps its code out of the
// Requester's first download.
export const routes: Routes = [
  {
    path: 'reviewer',
    loadChildren: () =>
      import('./reviewer/reviewer.routes').then((m) => m.reviewerRoutes),
  },
];
