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
        <div>
          <p class="kicker">{{ copy.brand }} · {{ copy.surface }}</p>
          <h1>{{ copy.title }}</h1>
        </div>

        @if (problem(); as p) {
          <div #problemBox class="notice failed" role="alert" tabindex="-1">
            @switch (p.kind) {
              @case ('failed') {
                <p class="notice-title">{{ copy.failedTitle }}</p>
                <p>{{ copy.failed }}</p>
              }
              @case ('throttled') {
                <p class="notice-title">{{ copy.failedTitle }}</p>
                <p>{{ throttledCopy(p.seconds) }}</p>
              }
              @case ('unavailable') {
                <p>{{ copy.unavailable }}</p>
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
          <app-field
            [label]="copy.code"
            inputId="code"
            messageId="code-hint"
            [hint]="copy.codeHint"
          >
            <input
              id="code"
              class="field-box code"
              formControlName="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              aria-describedby="code-hint"
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

        <hr class="divider" />
        <p class="note">{{ copy.note }}</p>
      </section>
    </div>
  `,
  styles: `
    .column {
      max-width: 460px;
      margin: 0 auto;
      padding: 96px 16px 48px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 32px;
    }
    h1 {
      font-size: 26px;
      font-weight: 600;
    }
    form {
      display: grid;
      gap: 20px;
    }
    .notice:focus {
      outline: none;
    }
    .notice:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .note {
      margin-top: -8px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--muted-foreground);
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
    brand: m.reviewer_brand(),
    surface: m.reviewer_surface(),
    title: m.reviewer_signin_title(),
    username: m.reviewer_signin_username(),
    password: m.reviewer_signin_password(),
    code: m.reviewer_signin_code(),
    codeHint: m.reviewer_signin_code_hint(),
    submit: m.reviewer_signin_submit(),
    loading: m.reviewer_signin_loading(),
    failedTitle: m.reviewer_signin_failed_title(),
    failed: m.reviewer_signin_failed(),
    unavailable: m.reviewer_signin_unavailable(),
    note: m.reviewer_signin_note(),
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
