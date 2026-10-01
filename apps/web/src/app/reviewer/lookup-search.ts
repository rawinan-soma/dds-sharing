import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { QueueApi } from './queue-api';
import { recordPath, zonePath } from './surface-paths';

type Problem = 'not_found' | 'failed' | null;

// The search field in the queue band, between the staleness line and refresh
// (spec §10.10, system.md screen 13). Exact reference only: there is
// deliberately no search by name, email, workplace or telephone, because a
// search by person is the prior-Request history §10.2 declined, by another
// route.
@Component({
  selector: 'app-lookup-search',
  template: `
    <form role="search" (submit)="$event.preventDefault(); find()">
      <!-- The label is the field's name for a screen reader; on screen the
           box carries it, as drawn. -->
      <label class="visually-hidden" for="lookup-reference">{{
        copy.label
      }}</label>
      <div class="line">
        <input
          id="lookup-reference"
          class="field-box figure"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          aria-describedby="lookup-message"
          [attr.placeholder]="copy.label"
          [attr.aria-invalid]="problem() === 'not_found' ? 'true' : null"
          [value]="reference()"
          (input)="typed($event)"
        />
        <button
          class="btn btn-secondary find"
          type="submit"
          [attr.aria-busy]="loading() || null"
        >
          {{ loading() ? copy.loading : copy.submit }}
        </button>
      </div>
      <!-- Polite, like the refresh result: "not found" must be heard too. -->
      <p
        id="lookup-message"
        class="field-message"
        [class.error]="problem()"
        aria-live="polite"
      >
        {{ problem() ? problemText() : copy.hint }}
      </p>
    </form>
  `,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 300px;
    }
    .line {
      display: flex;
      gap: 8px;
    }
    .field-box {
      height: 40px;
    }
    .find {
      flex: none;
    }
    .field-message {
      font-size: 12px;
    }
  `,
})
export class LookupSearch {
  private readonly api = inject(QueueApi);
  private readonly router = inject(Router);

  protected readonly reference = signal('');
  protected readonly loading = signal(false);
  protected readonly problem = signal<Problem>(null);

  protected readonly copy = {
    label: m.reviewer_lookup_label(),
    hint: m.reviewer_lookup_hint(),
    submit: m.reviewer_lookup_submit(),
    loading: m.reviewer_lookup_loading(),
  };

  protected problemText(): string {
    switch (this.problem()) {
      case 'not_found':
        return m.reviewer_lookup_not_found();
      case 'failed':
        return m.reviewer_lookup_failed();
      case null:
        return '';
    }
  }

  protected typed(event: Event): void {
    this.reference.set((event.target as HTMLInputElement).value);
    this.problem.set(null);
  }

  protected async find(): Promise<void> {
    const reference = this.reference().trim();
    if (!reference || this.loading()) return;
    this.loading.set(true);
    this.problem.set(null);
    const outcome = await this.api.lookup(reference);
    this.loading.set(false);
    switch (outcome.kind) {
      case 'zone':
        await this.router.navigate(zonePath(outcome.zone, outcome.requestId));
        return;
      case 'record':
        // Carried, so the record opens without being read a second time.
        await this.router.navigate(recordPath(outcome.record.reference), {
          state: { record: outcome.record },
        });
        return;
      case 'not_found':
      case 'failed':
        this.problem.set(outcome.kind);
    }
  }
}
