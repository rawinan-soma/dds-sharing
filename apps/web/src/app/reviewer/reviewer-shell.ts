import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
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
    <router-outlet />
    <app-session-toast />
  `,
})
export class ReviewerShell implements OnInit, OnDestroy {
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
