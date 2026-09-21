import { Component, inject } from '@angular/core';
import * as m from '../../paraglide/messages.js';
import { ReviewerSession } from './reviewer-session';

// The T-5 warning: a toast at the bottom left, never a modal or a banner, so
// it does not take the page from a Reviewer who is half way through something.
// role="alert" so a screen reader hears it (WCAG 4.1.3).
@Component({
  selector: 'app-session-toast',
  template: `
    @if (session.warning()) {
      <aside class="toast" role="alert">
        <p class="title">{{ title }}</p>
        <p class="detail">{{ detail }}</p>
        <div class="actions">
          <button class="btn btn-primary" type="button" (click)="resume()">
            {{ resumeLabel }}
          </button>
          <button class="btn btn-quiet" type="button" (click)="dismiss()">
            {{ dismissLabel }}
          </button>
        </div>
      </aside>
    }
  `,
  styles: `
    .toast {
      position: fixed;
      left: 1rem;
      bottom: 1rem;
      z-index: 10;
      max-width: 22rem;
      padding: 1rem;
      background: var(--pending-wash);
      border: 1px solid var(--border-strong);
      border-left: 2px solid var(--pending);
    }
    .toast p {
      margin: 0;
    }
    .title {
      font-weight: 600;
      color: var(--pending);
    }
    .detail {
      margin-top: 0.25rem;
      font-size: 0.875rem;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }
  `,
})
export class SessionToast {
  protected readonly session = inject(ReviewerSession);
  protected readonly title = m.reviewer_session_warning_title();
  protected readonly detail = m.reviewer_session_warning_detail();
  protected readonly resumeLabel = m.reviewer_session_warning_resume();
  protected readonly dismissLabel = m.reviewer_session_warning_dismiss();

  protected resume(): Promise<void> {
    return this.session.signInAgain();
  }

  protected dismiss(): void {
    this.session.dismissWarning();
  }
}
