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
    <div class="surface">
      <router-outlet />
    </div>
    <section class="narrow card">
      <p class="kicker">{{ narrow.brand }} · {{ narrow.surface }}</p>
      <h1>{{ narrow.title }}</h1>
      <p>{{ narrow.detail }}</p>
    </section>
    <app-session-toast />
  `,
  // Under 1024 CSS px every Reviewer route is this one card and nothing else
  // (§16.1, screen R): no queue, no partial layout. Hidden with display:none,
  // so the screen behind it is out of the accessibility tree too.
  styles: `
    .narrow {
      display: none;
      max-width: 460px;
      margin: 48px auto;
    }
    .narrow h1 {
      margin: 4px 0 12px;
      font-size: 22px;
      font-weight: 600;
    }
    @media (max-width: 1023.98px) {
      .surface {
        display: none;
      }
      .narrow {
        display: block;
      }
    }
    @media (max-width: 499.98px) {
      .narrow {
        margin: 24px 16px;
      }
    }
  `,
})
export class ReviewerShell implements OnInit, OnDestroy {
  protected readonly narrow = {
    brand: m.reviewer_brand(),
    surface: m.reviewer_surface(),
    title: m.reviewer_narrow_title(),
    detail: m.reviewer_narrow_detail(),
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
