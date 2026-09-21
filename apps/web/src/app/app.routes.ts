import { Routes } from '@angular/router';
import * as m from '../paraglide/messages.js';
import { RequestPage } from './requester/request-page.component';
import { SubmittedPage } from './requester/submitted-page.component';

export const routes: Routes = [
  { path: '', component: RequestPage, title: () => m.requester_page_title() },
  {
    path: 'submitted',
    component: SubmittedPage,
    title: () => m.requester_confirm_title(),
  },
];
