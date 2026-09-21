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
import { safeReturnTo } from './return-to';
import { ReviewerSession } from './reviewer-session';

type Problem =
  | { kind: 'failed' }
  | { kind: 'throttled'; seconds: number }
  | { kind: 'unavailable' };

// Username, password and the authenticator code on ONE form, submitted and
// checked together. A two-step form tells an attacker when the password is
// right, which is what makes attacking the second factor worthwhile. So there is
// one failure message, and the screen never says which of the three was wrong.
@Component({
  selector: 'app-reviewer-sign-in',
  imports: [ReactiveFormsModule, Field],
  template: `
    <div class="column">
      <section class="card">
        <p class="kicker">{{ copy.subtitle }}</p>
        <h2>{{ copy.title }}</h2>

        @if (problem(); as p) {
          <div #problemBox class="problem" role="alert" tabindex="-1">
            @switch (p.kind) {
              @case ('failed') {
                <p class="first">{{ copy.failed }}</p>
                <p class="second">{{ copy.noLockout }}</p>
              }
              @case ('throttled') {
                <p class="first">{{ throttledCopy(p.seconds) }}</p>
                <p class="second">{{ copy.noLockout }}</p>
              }
              @case ('unavailable') {
                <p class="first">{{ copy.unavailable }}</p>
              }
            }
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <app-field [label]="copy.username" inputId="username">
            <input
              id="username"
              class="field-box"
              formControlName="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              [attr.aria-invalid]="problem() ? 'true' : null"
            />
          </app-field>
          <app-field [label]="copy.password" inputId="password">
            <input
              id="password"
              class="field-box"
              type="password"
              formControlName="password"
              autocomplete="current-password"
              [attr.aria-invalid]="problem() ? 'true' : null"
            />
          </app-field>
          <app-field [label]="copy.code" inputId="code">
            <input
              id="code"
              class="field-box code"
              formControlName="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              [attr.aria-invalid]="problem() ? 'true' : null"
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

      <section class="notes">
        <p>{{ copy.auditNote }}</p>
        <h3>{{ copy.recoveryHeading }}</h3>
        <p>{{ copy.recoveryDetail }}</p>
        <p>{{ copy.unlistedNote }}</p>
      </section>
    </div>
  `,
  styles: `
    .column {
      max-width: 460px;
      margin: 3rem auto;
      padding: 0 1rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border-strong);
      padding: 2rem;
    }
    .kicker {
      margin: 0;
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
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
    .problem p {
      margin: 0;
    }
    .problem .second {
      font-size: 0.875rem;
    }
    .notes {
      margin-top: 1.5rem;
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    .notes h3 {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--foreground);
    }
    .notes p {
      margin: 0.25rem 0 0.75rem;
    }
  `,
})
export class SignInPage {
  private readonly session = inject(ReviewerSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly problemBox =
    viewChild<ElementRef<HTMLElement>>('problemBox');

  protected readonly copy = {
    subtitle: m.reviewer_signin_subtitle(),
    title: m.reviewer_signin_title(),
    username: m.reviewer_signin_username(),
    password: m.reviewer_signin_password(),
    code: m.reviewer_signin_code(),
    submit: m.reviewer_signin_submit(),
    loading: m.reviewer_signin_loading(),
    failed: m.reviewer_signin_failed(),
    noLockout: m.reviewer_signin_no_lockout(),
    unavailable: m.reviewer_signin_unavailable(),
    auditNote: m.reviewer_signin_audit_note(),
    recoveryHeading: m.reviewer_signin_recovery_heading(),
    recoveryDetail: m.reviewer_signin_recovery_detail(),
    unlistedNote: m.reviewer_signin_unlisted_note(),
  };
  protected readonly throttledCopy = (seconds: number) =>
    m.reviewer_signin_throttled({ seconds });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    username: '',
    password: '',
    code: '',
  });
  protected readonly loading = signal(false);
  protected readonly problem = signal<Problem | null>(null);

  protected async submit(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.problem.set(null);
    const { username, password, code } = this.form.getRawValue();
    try {
      // The first answer from the server also hands the page its CSRF token.
      await this.session.ensureReady();
      const outcome = await this.session.signIn(
        username.trim(),
        password,
        code.trim(),
      );
      if (outcome.kind === 'ok') {
        await this.leave(outcome.session.mustChangePassword);
        return;
      }
      this.problem.set(
        outcome.kind === 'throttled'
          ? { kind: 'throttled', seconds: outcome.retryAfterSeconds }
          : { kind: outcome.kind },
      );
      // A failed submit moves focus to the message, so it is read (WCAG 4.1.3).
      afterNextRender(() => this.problemBox()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } finally {
      this.loading.set(false);
      // The code was spent whether or not the rest was right.
      this.form.controls.code.reset('');
    }
  }

  private async leave(mustChangePassword: boolean): Promise<void> {
    const returnTo = safeReturnTo(
      this.route.snapshot.queryParamMap.get('returnTo'),
    );
    if (mustChangePassword) {
      await this.router.navigate(['/reviewer/password'], {
        queryParams: returnTo === '/reviewer' ? {} : { returnTo },
      });
      return;
    }
    await this.router.navigateByUrl(returnTo);
  }
}
