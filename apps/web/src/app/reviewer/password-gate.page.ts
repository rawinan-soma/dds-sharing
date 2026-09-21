import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { Field } from './field';
import { type PasswordViolation } from './reviewer-api';
import { safeReturnTo } from './return-to';
import { ReviewerSession } from './reviewer-session';

type Problem =
  | { kind: 'failed' }
  | { kind: 'policy'; violations: PasswordViolation[] }
  | { kind: 'throttled'; seconds: number }
  | { kind: 'unavailable' };

const VIOLATION_COPY: Record<PasswordViolation, () => string> = {
  too_short: m.reviewer_password_violation_too_short,
  too_long: m.reviewer_password_violation_too_long,
  no_uppercase: m.reviewer_password_violation_no_uppercase,
  no_digit: m.reviewer_password_violation_no_digit,
  no_special: m.reviewer_password_violation_no_special,
  same_as_current: m.reviewer_password_violation_same_as_current,
};

// The forced change after first sign-in. It carries what is recorded about the
// Reviewer, once: the notice is part of this gate, and the gate exists only while
// the server still says the password must change, so it never comes back.
@Component({
  selector: 'app-reviewer-password-gate',
  imports: [ReactiveFormsModule, Field],
  template: `
    <div class="column">
      <section class="notice" aria-labelledby="retention-heading">
        <h3 id="retention-heading">{{ copy.retentionHeading }}</h3>
        <ul>
          <li>{{ copy.retentionSignins }}</li>
          <li>{{ copy.retentionResponseTimes }}</li>
          <li>{{ copy.retentionAlerts }}</li>
          <li>{{ copy.retentionDisplayName }}</li>
        </ul>
        <p>{{ copy.retentionPermanent }}</p>
      </section>

      <section class="card">
        <h2>{{ copy.title }}</h2>
        <p class="lead">{{ copy.detail }}</p>

        @if (problem(); as p) {
          <div #problemBox class="problem" role="alert" tabindex="-1">
            @switch (p.kind) {
              @case ('failed') {
                <p>{{ copy.failed }}</p>
              }
              @case ('policy') {
                <ul>
                  @for (violation of p.violations; track violation) {
                    <li>{{ violationCopy(violation) }}</li>
                  }
                </ul>
              }
              @case ('throttled') {
                <p>{{ throttledCopy(p.seconds) }}</p>
              }
              @case ('unavailable') {
                <p>{{ copy.unavailable }}</p>
              }
            }
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <app-field [label]="copy.current" inputId="current-password">
            <input
              id="current-password"
              class="field-box"
              type="password"
              formControlName="current"
              autocomplete="current-password"
            />
          </app-field>
          <app-field
            [label]="copy.next"
            inputId="new-password"
            messageId="new-password-rules"
            [hint]="copy.rules"
          >
            <input
              id="new-password"
              class="field-box"
              type="password"
              formControlName="next"
              autocomplete="new-password"
              aria-describedby="new-password-rules"
              [attr.aria-invalid]="problemIsPolicy() ? 'true' : null"
            />
          </app-field>
          <app-field
            [label]="copy.code"
            inputId="change-code"
            messageId="change-code-hint"
            [hint]="copy.freshCode"
          >
            <input
              id="change-code"
              class="field-box code"
              formControlName="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              aria-describedby="change-code-hint"
            />
          </app-field>
          <button
            class="btn btn-primary btn-lg btn-full"
            type="submit"
            [attr.aria-busy]="loading() || null"
          >
            {{ loading() ? copy.loading : copy.submit }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: `
    .column {
      max-width: 560px;
      margin: 3rem auto;
      padding: 0 1rem;
      display: grid;
      gap: 1.5rem;
    }
    .notice {
      border-top: 1px solid var(--border-strong);
      padding-top: 1rem;
    }
    .notice h3 {
      font-size: 1rem;
      font-weight: 600;
    }
    .notice ul {
      margin: 0.5rem 0;
      padding-left: 1.25rem;
    }
    .notice p {
      margin: 0;
      font-weight: 600;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border-strong);
      padding: 2rem;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 600;
    }
    .lead {
      margin: 0.5rem 0 1.25rem;
      color: var(--muted-foreground);
    }
    form {
      display: grid;
      gap: 1.25rem;
    }
    .problem {
      margin-bottom: 1.25rem;
      padding: 0.75rem 1rem;
      background: var(--failed-wash);
      border-left: 2px solid var(--failed);
      color: var(--failed);
    }
    .problem p,
    .problem ul {
      margin: 0;
    }
    .problem ul {
      padding-left: 1.25rem;
    }
  `,
})
export class PasswordGatePage {
  private readonly session = inject(ReviewerSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly problemBox =
    viewChild<ElementRef<HTMLElement>>('problemBox');

  protected readonly copy = {
    retentionHeading: m.reviewer_retention_heading(),
    retentionSignins: m.reviewer_retention_signins(),
    retentionResponseTimes: m.reviewer_retention_response_times(),
    retentionAlerts: m.reviewer_retention_alerts(),
    retentionDisplayName: m.reviewer_retention_display_name(),
    retentionPermanent: m.reviewer_retention_permanent(),
    title: m.reviewer_first_login_title(),
    detail: m.reviewer_first_login_detail(),
    freshCode: m.reviewer_first_login_fresh_code(),
    current: m.reviewer_password_current(),
    next: m.reviewer_password_new(),
    rules: m.reviewer_password_rules(),
    code: m.reviewer_signin_code(),
    submit: m.reviewer_password_submit(),
    loading: m.reviewer_password_loading(),
    failed: m.reviewer_password_failed(),
    unavailable: m.reviewer_signin_unavailable(),
  };
  protected readonly violationCopy = (violation: PasswordViolation) =>
    VIOLATION_COPY[violation]();
  protected readonly throttledCopy = (seconds: number) =>
    m.reviewer_signin_throttled({ seconds });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    current: '',
    next: '',
    code: '',
  });
  protected readonly loading = signal(false);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly problemIsPolicy = () => this.problem()?.kind === 'policy';

  protected async submit(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.problem.set(null);
    const { current, next, code } = this.form.getRawValue();
    try {
      const outcome = await this.session.changePassword(
        current,
        next,
        code.trim(),
      );
      switch (outcome.kind) {
        case 'ok':
          await this.router.navigateByUrl(
            safeReturnTo(this.route.snapshot.queryParamMap.get('returnTo')),
          );
          return;
        case 'session_ended':
          // The session service is already sending the Reviewer to sign-in.
          return;
        case 'throttled':
          this.problem.set({
            kind: 'throttled',
            seconds: outcome.retryAfterSeconds,
          });
          break;
        case 'policy':
          this.problem.set({ kind: 'policy', violations: outcome.violations });
          break;
        default:
          this.problem.set({ kind: outcome.kind });
      }
      afterNextRender(() => this.problemBox()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } finally {
      this.loading.set(false);
      // A code is single use, so the box never keeps yesterday's.
      this.form.controls.code.reset('');
    }
  }
}
