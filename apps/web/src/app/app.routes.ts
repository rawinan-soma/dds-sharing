import { Routes } from '@angular/router';
import * as m from '../paraglide/messages.js';
import { RequestPage } from './requester/request-page.component';
import { SubmittedPage } from './requester/submitted-page.component';

// The Reviewer surface is its own chunk: lazy loading keeps its code out of the
// Requester's first download.
export const routes: Routes = [
  { path: '', component: RequestPage, title: () => m.requester_page_title() },
  {
    path: 'submitted',
    component: SubmittedPage,
    title: () => m.requester_confirm_title(),
  },
  {
    path: 'reviewer',
    loadChildren: () =>
      import('./reviewer/reviewer.routes').then((m) => m.reviewerRoutes),
  },
];
