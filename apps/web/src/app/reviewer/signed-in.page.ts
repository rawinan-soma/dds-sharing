import { Component, inject } from '@angular/core';
import * as m from '../../paraglide/messages.js';
import { ReviewerSession } from './reviewer-session';

// Nothing is reviewable yet: this slice delivers the identity and the door. The
// queue and the review screen replace this page.
@Component({
  selector: 'app-reviewer-signed-in',
  template: `
    <div class="column">
      <p class="who">{{ signedInAs() }}</p>
      <p>{{ empty }}</p>
      <button class="btn btn-quiet" type="button" (click)="signOut()">
        {{ signOutLabel }}
      </button>
    </div>
  `,
  styles: `
    .column {
      max-width: 720px;
      margin: 3rem auto;
      padding: 0 1rem;
    }
    .who {
      font-weight: 600;
      margin: 0;
    }
  `,
})
export class SignedInPage {
  private readonly session = inject(ReviewerSession);
  protected readonly empty = m.reviewer_signed_in_empty();
  protected readonly signOutLabel = m.reviewer_signout();
  protected readonly signedInAs = () =>
    m.reviewer_signed_in_as({
      reviewer: this.session.current()?.displayName ?? '',
    });

  protected signOut(): Promise<void> {
    return this.session.signOut();
  }
}
