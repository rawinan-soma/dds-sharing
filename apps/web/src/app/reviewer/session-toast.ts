import { Component, inject } from '@angular/core';
import * as m from '../../paraglide/messages.js';
import { ReviewerSession } from './reviewer-session';

// The T-5 warning (system.md "Component: Toast", frame 12d): a dark panel at
// the bottom left, never a modal or a banner, so it does not take the page
// from a Reviewer who is half way through something. role="alert" so a
// screen reader hears it (WCAG 4.1.3).
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
      left: 24px;
      bottom: 24px;
      z-index: 30;
      width: 400px;
      max-width: calc(100vw - 48px);
      padding: 16px 18px;
      color: var(--inverse);
      background: var(--foreground);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-float);
    }
    .title {
      font-size: 14px;
      font-weight: 600;
    }
    /* 10.47:1 on the panel. */
    .detail {
      margin-top: 4px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--inverse-muted);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 12px;
    }
    /* The quiet variant on the dark panel: its muted ink would be too faint
       here, so it takes the body's ink for both ink and edge. */
    .btn-quiet {
      color: var(--inverse-muted);
      border-color: var(--inverse-muted);
    }
    .btn-quiet:hover,
    .btn-quiet:active {
      color: var(--foreground);
    }
    /* primary on the dark panel is too close to read as a ring. */
    .toast :focus-visible {
      outline-color: var(--inverse);
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
