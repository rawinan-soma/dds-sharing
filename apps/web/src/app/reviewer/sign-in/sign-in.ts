import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReviewerApiService, type SignInResponse } from '../reviewer-api.service';

// Spec §17.5 / §17.4: this surface is not linked from the public app and is
// kept out of search results. robots.txt already disallows the path and the
// server sends `X-Robots-Tag: noindex`; this tag is belt-and-suspenders for
// a crawler that renders the SPA. None of this is a security control.
const ROBOTS_NOINDEX = 'noindex';

@Component({
  selector: 'app-reviewer-sign-in',
  imports: [ReactiveFormsModule],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
})
export class ReviewerSignIn implements OnInit, OnDestroy {
  private readonly api = inject(ReviewerApiService);
  private readonly meta = inject(Meta);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly signedInAs = signal<SignInResponse | null>(null);
  protected readonly submitting = signal(false);
  // One generic message regardless of which factor was wrong (spec §17.5) — the
  // form never learns, and must never render, which of username/password/code failed.
  protected readonly errorKey = signal<'generic' | 'throttled' | 'unexpected' | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    totpCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    this.meta.addTag({ name: 'robots', content: ROBOTS_NOINDEX });
  }

  ngOnDestroy(): void {
    this.meta.removeTag(`name="robots"`);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorKey.set(null);
    try {
      const { username, password, totpCode } = this.form.getRawValue();
      const outcome = await this.api.signIn(username, password, totpCode);
      switch (outcome.outcome) {
        case 'success':
          this.signedInAs.set(outcome.result);
          break;
        case 'throttled':
          this.errorKey.set('throttled');
          break;
        case 'invalid_credentials':
          this.errorKey.set('generic');
          break;
        case 'unexpected':
          this.errorKey.set('unexpected');
          break;
      }
    } finally {
      this.submitting.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    this.signedInAs.set(null);
    this.form.reset();
  }
}
