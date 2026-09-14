import { Routes } from '@angular/router';
import { RequestFormPage } from './features/request-form/request-form.page.js';
import { SubmittedPage } from './features/submitted/submitted.page.js';

export const routes: Routes = [
  { path: '', component: RequestFormPage },
  { path: 'submitted', component: SubmittedPage },
  { path: '**', redirectTo: '' },
];
