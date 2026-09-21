import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { ReviewerSession } from './reviewer-session';
import { SessionToast } from './session-toast';

const NOINDEX = { name: 'robots', content: 'noindex, nofollow' };

// Everything under /reviewer. It is not linked from the public app and is kept
// out of search results (the server also sends X-Robots-Tag on the shell). That
// is tidiness, not security: no protection is claimed for the URL.
@Component({
  selector: 'app-reviewer-shell',
  imports: [RouterOutlet, SessionToast],
  template: `
    <div class="surface"><router-outlet /></div>
    <section class="narrow">
      <h1>{{ narrow.title }}</h1>
      <p>{{ narrow.detail }}</p>
      <p>{{ narrow.desk }}</p>
    </section>
    <app-session-toast />
  `,
  // Under 1024 CSS px every Reviewer route is this one sentence and nothing
  // else (§16.1): no queue, no partial layout. Hidden with display:none, so the
  // screen behind it is out of the accessibility tree too.
  styles: `
    .narrow {
      display: none;
      max-width: 460px;
      margin: 3rem auto;
      padding: 0 1rem;
    }
    .narrow h1 {
      font-size: 1.25rem;
      margin-bottom: 0.75rem;
    }
    .narrow p + p {
      margin-top: 0.75rem;
    }
    @media (max-width: 1023.98px) {
      .surface {
        display: none;
      }
      .narrow {
        display: block;
      }
    }
  `,
})
export class ReviewerShell implements OnInit, OnDestroy {
  protected readonly narrow = {
    title: m.reviewer_narrow_title(),
    detail: m.reviewer_narrow_detail(),
    desk: m.reviewer_narrow_desk(),
  };
  private readonly meta = inject(Meta);
  private readonly session = inject(ReviewerSession);

  ngOnInit(): void {
    this.meta.addTag(NOINDEX);
    void this.session.ensureReady();
  }

  ngOnDestroy(): void {
    this.meta.removeTag(`name='${NOINDEX.name}'`);
  }
}
