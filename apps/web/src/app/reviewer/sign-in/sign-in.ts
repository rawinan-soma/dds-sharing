import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReviewerApiService, type PasswordPolicyViolation, type SignInResponse } from '../reviewer-api.service';
import { SessionCeilingService } from '../session-ceiling.service';
import { ReviewerQueuePage } from '../queue/reviewer-queue.page';

// Spec §17.5 / §17.4: this surface is not linked from the public app and is
// kept out of search results. robots.txt already disallows the path and the
// server sends `X-Robots-Tag: noindex`; this tag is belt-and-suspenders for
// a crawler that renders the SPA. None of this is a security control.
const ROBOTS_NOINDEX = 'noindex';

const POLICY_VIOLATION_MESSAGES: Record<PasswordPolicyViolation, string> = {
  too_short: 'At least 12 characters.',
  too_long: 'At most 20 characters.',
  missing_uppercase: 'At least one uppercase letter.',
  missing_digit: 'At least one digit.',
  missing_special: 'At least one special character.',
};

type Phase = 'sign-in' | 'password-gate' | 'signed-in';

@Component({
  selector: 'app-reviewer-sign-in',
  imports: [ReactiveFormsModule, ReviewerQueuePage],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
})
export class ReviewerSignIn implements OnInit, OnDestroy {
  private readonly api = inject(ReviewerApiService);
  private readonly meta = inject(Meta);
  private readonly formBuilder = inject(FormBuilder);
  private readonly sessionCeiling = inject(SessionCeilingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly phase = signal<Phase>('sign-in');
  protected readonly session = signal<SignInResponse | null>(null);
  protected readonly submitting = signal(false);
  // One generic message regardless of which factor was wrong (spec §17.5) — the
  // form never learns, and must never render, which of username/password/code failed.
  protected readonly errorKey = signal<'generic' | 'throttled' | 'unexpected' | null>(null);

  protected readonly sessionWarningVisible = this.sessionCeiling.warningVisible;

  protected readonly form = this.formBuilder.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    totpCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected readonly changePasswordSubmitting = signal(false);
  protected readonly changePasswordErrorKey = signal<'generic' | 'throttled' | 'unexpected' | null>(null);
  protected readonly changePasswordViolations = signal<PasswordPolicyViolation[] | null>(null);
  protected readonly policyViolationMessages = POLICY_VIOLATION_MESSAGES;

  protected readonly changePasswordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', Validators.required],
    totpCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    this.meta.addTag({ name: 'robots', content: ROBOTS_NOINDEX });
  }

  ngOnDestroy(): void {
    this.meta.removeTag(`name="robots"`);
    this.sessionCeiling.stop();
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
          this.onSignedIn(outcome.result);
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

  private onSignedIn(result: SignInResponse): void {
    this.session.set(result);
    this.sessionCeiling.start(result.absoluteExpiresAt, () => this.onSessionExpired());
    this.phase.set(result.mustChangePassword ? 'password-gate' : 'signed-in');
    if (!result.mustChangePassword) {
      this.returnToWhereTheReviewerWas();
    }
  }

  private returnToWhereTheReviewerWas(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo && returnTo !== '/reviewer') {
      void this.router.navigateByUrl(returnTo);
    }
  }

  async submitChangePassword(): Promise<void> {
    if (this.changePasswordForm.invalid || this.changePasswordSubmitting()) return;

    this.changePasswordSubmitting.set(true);
    this.changePasswordErrorKey.set(null);
    this.changePasswordViolations.set(null);
    try {
      const { currentPassword, newPassword, totpCode } = this.changePasswordForm.getRawValue();
      const outcome = await this.api.changePassword(currentPassword, newPassword, totpCode);
      switch (outcome.outcome) {
        case 'ok': {
          const current = this.session();
          if (current) this.session.set({ ...current, mustChangePassword: false });
          this.phase.set('signed-in');
          this.changePasswordForm.reset();
          this.returnToWhereTheReviewerWas();
          break;
        }
        case 'policy_violation':
          this.changePasswordViolations.set(outcome.violations);
          break;
        case 'throttled':
          this.changePasswordErrorKey.set('throttled');
          break;
        case 'invalid_current_credentials':
          this.changePasswordErrorKey.set('generic');
          break;
        case 'unexpected':
          this.changePasswordErrorKey.set('unexpected');
          break;
      }
    } finally {
      this.changePasswordSubmitting.set(false);
    }
  }

  /** Bound from the template for both the session-ceiling timer and a 401 the queue page surfaces (idle timeout has no client-side timer of its own). */
  protected onSessionExpired(): void {
    this.sessionCeiling.stop();
    const returnTo = this.router.url;
    this.phase.set('sign-in');
    this.session.set(null);
    this.changePasswordViolations.set(null);
    this.changePasswordErrorKey.set(null);
    this.form.reset();
    this.changePasswordForm.reset();
    void this.router.navigate(['/reviewer'], { queryParams: { returnTo } });
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    this.sessionCeiling.stop();
    this.phase.set('sign-in');
    this.session.set(null);
    this.form.reset();
  }
}
