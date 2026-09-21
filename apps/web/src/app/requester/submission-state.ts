import { Injectable, signal } from '@angular/core';

// What the confirmation page shows, held in memory. The page's address carries
// none of it: a confirmation addressable by reference number would be a second
// unauthenticated capability exposing a Requester's own ask (spec §16.2).
export interface Submission {
  reference: string;
  diseaseGroupName: string;
  from: string;
  to: string;
  /** Already worded: the whole country, a province, or a health region. */
  areaLabel: string;
}

@Injectable({ providedIn: 'root' })
export class SubmissionState {
  readonly current = signal<Submission | null>(null);
}
